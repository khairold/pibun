/**
 * Composer — message input area with send/abort controls.
 *
 * Features (from plan 1C.8):
 * - Multi-line textarea with auto-resize
 * - Enter to send, Shift+Enter for newline
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

	const [value, setValue] = useState("");
	const [isSending, setIsSending] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const setLastError = useStore((s) => s.setLastError);

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

	/** Send the current message as a prompt. */
	const handleSend = useCallback(async () => {
		const message = value.trim();
		if (!message || isSending) return;

		setIsSending(true);
		try {
			const ready = await ensureSession();
			if (!ready) return;

			await getTransport().request("session.prompt", { message });
			setValue("");

			// Reset textarea height after clearing
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (textarea) {
					textarea.style.height = "auto";
				}
			});
		} catch (err) {
			console.error("[Composer] Failed to send prompt:", err);
			setLastError(`Failed to send message: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, ensureSession, setLastError]);

	/** Abort the currently streaming response. */
	const handleAbort = useCallback(async () => {
		try {
			await getTransport().request("session.abort");
		} catch (err) {
			console.error("[Composer] Failed to abort:", err);
			setLastError(`Failed to abort: ${errorMessage(err)}`);
		}
	}, [setLastError]);

	/** Handle keyboard events: Enter to send, Shift+Enter for newline. */
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				if (canSend && !isStreaming) {
					handleSend();
				}
			}
		},
		[canSend, isStreaming, handleSend],
	);

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
					placeholder={isConnected ? "Send a message…" : "Connecting…"}
					disabled={!isConnected}
					rows={1}
					className={cn(
						"flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3",
						"text-sm text-neutral-100 placeholder-neutral-500",
						"outline-none transition-colors",
						"focus:border-neutral-500",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
					style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
				/>

				{/* Send or Abort button */}
				{isStreaming ? (
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
								: "bg-neutral-800 text-neutral-500 cursor-not-allowed",
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
		</div>
	);
}
