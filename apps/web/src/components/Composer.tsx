/**
 * Composer — message input area with send/steer/follow-up/abort controls.
 *
 * Features:
 * - Multi-line textarea with auto-resize
 * - Enter to send (when not streaming), Shift+Enter for newline
 * - During streaming: Enter to steer, Ctrl+Enter for follow-up
 * - Abort button visible during streaming
 * - Send button (disabled when empty or while starting session)
 * - Auto-starts Pi session on first prompt if none exists
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";

/** Extract a user-friendly error message. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

/** Maximum textarea height in pixels before scrolling. */
const MAX_TEXTAREA_HEIGHT = 200;

export function Composer() {
	const isStreaming = useStore((s) => s.isStreaming);
	const sessionId = useStore((s) => s.sessionId);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const setSessionId = useStore((s) => s.setSessionId);
	const setLastError = useStore((s) => s.setLastError);
	const addToast = useStore((s) => s.addToast);

	const [value, setValue] = useState("");
	const [isSending, setIsSending] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const isConnected = connectionStatus === "open";
	const canSend = isConnected && value.trim().length > 0 && !isSending;

	/** Auto-resize textarea to fit content. */
	const resizeTextarea = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		// Reset height to auto to measure scrollHeight accurately
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
	}, []);

	/** Reset textarea after sending. */
	const clearInput = useCallback(() => {
		setValue("");
		requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			if (textarea) {
				textarea.style.height = "auto";
			}
		});
	}, []);

	/** Ensure a session exists, starting one if needed. Returns true if ready. */
	const ensureSession = useCallback(async (): Promise<boolean> => {
		if (sessionId) return true;
		try {
			const result = await getTransport().request("session.start", {});
			setSessionId(result.sessionId);
			return true;
		} catch (err) {
			console.error("[Composer] Failed to start session:", err);
			setLastError(`Failed to start session: ${errorMessage(err)}`);
			return false;
		}
	}, [sessionId, setSessionId, setLastError]);

	/** Send the current message as a prompt (when not streaming). */
	const handleSend = useCallback(async () => {
		const message = value.trim();
		if (!message || isSending) return;

		setIsSending(true);
		try {
			const ready = await ensureSession();
			if (!ready) return;

			await getTransport().request("session.prompt", { message });
			clearInput();
		} catch (err) {
			console.error("[Composer] Failed to send prompt:", err);
			setLastError(`Failed to send message: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, ensureSession, setLastError, clearInput]);

	/** Send a steering message (redirects Pi during streaming). */
	const handleSteer = useCallback(async () => {
		const message = value.trim();
		if (!message || isSending || !isStreaming) return;

		setIsSending(true);
		try {
			await getTransport().request("session.steer", { message });
			clearInput();
			addToast("Steering message sent", "info");
		} catch (err) {
			console.error("[Composer] Failed to steer:", err);
			setLastError(`Failed to steer: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, isStreaming, setLastError, clearInput, addToast]);

	/** Queue a follow-up message (delivered after Pi finishes). */
	const handleFollowUp = useCallback(async () => {
		const message = value.trim();
		if (!message || isSending || !isStreaming) return;

		setIsSending(true);
		try {
			await getTransport().request("session.followUp", { message });
			clearInput();
			addToast("Follow-up queued", "info");
		} catch (err) {
			console.error("[Composer] Failed to queue follow-up:", err);
			setLastError(`Failed to queue follow-up: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, isStreaming, setLastError, clearInput, addToast]);

	/** Abort the currently streaming response. */
	const handleAbort = useCallback(async () => {
		try {
			await getTransport().request("session.abort");
		} catch (err) {
			console.error("[Composer] Failed to abort:", err);
			setLastError(`Failed to abort: ${errorMessage(err)}`);
		}
	}, [setLastError]);

	/** Handle keyboard events. */
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				if (isStreaming && canSend) {
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Enter / Cmd+Enter during streaming → follow-up
						handleFollowUp();
					} else {
						// Enter during streaming → steer
						handleSteer();
					}
				} else if (!isStreaming && canSend && !e.ctrlKey && !e.metaKey) {
					// Enter when not streaming → send prompt
					e.preventDefault();
					handleSend();
				}
			}
		},
		[canSend, isStreaming, handleSend, handleSteer, handleFollowUp],
	);

	/** Determine placeholder text based on current state. */
	const placeholder = !isConnected
		? "Connecting…"
		: isStreaming
			? "Enter to steer · Ctrl+Enter for follow-up…"
			: "Send a message…";

	return (
		<div className="border-t border-neutral-800 bg-neutral-950 px-4 py-3">
			<div className="mx-auto flex max-w-3xl items-end gap-2">
				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						resizeTextarea();
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={!isConnected}
					rows={1}
					className={cn(
						"flex-1 resize-none rounded-lg border bg-neutral-900 px-4 py-3",
						"text-sm text-neutral-100 placeholder-neutral-500",
						"outline-none transition-colors",
						"focus:border-neutral-500",
						"disabled:cursor-not-allowed disabled:opacity-50",
						isStreaming ? "border-blue-700/50" : "border-neutral-700",
					)}
					style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
				/>

				{/* Action buttons */}
				{isStreaming ? (
					<div className="flex items-end gap-1.5">
						{/* Steer / Follow-up send button (shown when there's text) */}
						{value.trim().length > 0 && (
							<button
								type="button"
								onClick={handleSteer}
								disabled={!canSend}
								className={cn(
									"flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3",
									"text-xs font-medium transition-colors",
									canSend
										? "bg-blue-600 text-white hover:bg-blue-500"
										: "cursor-not-allowed bg-neutral-800 text-neutral-500",
								)}
								title="Steer (Enter) — redirect Pi during streaming"
							>
								{/* Steer icon — curved arrow */}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="currentColor"
									className="h-3.5 w-3.5"
									aria-label="Steer"
									role="img"
								>
									<path d="M2.5 8a5.5 5.5 0 0 1 9.3-4l-1.65.95a.5.5 0 0 0 .25.93H14a.5.5 0 0 0 .5-.5V1.8a.5.5 0 0 0-.93-.25l-.95 1.65A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0A5.5 5.5 0 0 1 2.5 8z" />
								</svg>
								Steer
							</button>
						)}

						{/* Abort button */}
						<button
							type="button"
							onClick={handleAbort}
							className={cn(
								"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
								"bg-red-600 text-white transition-colors hover:bg-red-500",
							)}
							title="Abort (Ctrl+C)"
						>
							{/* Stop icon — square */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-4 w-4"
								aria-label="Abort"
								role="img"
							>
								<rect x="3" y="3" width="10" height="10" rx="1" />
							</svg>
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={handleSend}
						disabled={!canSend}
						className={cn(
							"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
							"transition-colors",
							canSend
								? "bg-blue-600 text-white hover:bg-blue-500"
								: "cursor-not-allowed bg-neutral-800 text-neutral-500",
						)}
						title="Send (Enter)"
					>
						{/* Send icon — arrow up */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-4 w-4"
							aria-label="Send"
							role="img"
						>
							<path d="M8 2.5a.5.5 0 0 1 .354.146l4 4a.5.5 0 0 1-.708.708L8.5 4.207V13a.5.5 0 0 1-1 0V4.207L4.354 7.354a.5.5 0 1 1-.708-.708l4-4A.5.5 0 0 1 8 2.5z" />
						</svg>
					</button>
				)}
			</div>

			{/* Streaming mode hint */}
			{isStreaming && (
				<div className="mx-auto mt-1.5 max-w-3xl">
					<p className="text-xs text-neutral-500">
						<span className="text-blue-400">Enter</span> to steer ·{" "}
						<span className="text-blue-400">Ctrl+Enter</span> for follow-up ·{" "}
						<span className="text-red-400">Stop</span> to abort
					</p>
				</div>
			)}
		</div>
	);
}
