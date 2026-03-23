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
 * - Image paste from clipboard (Ctrl+V / Cmd+V)
 * - Image preview strip with remove buttons
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import {
	type ClipboardEvent,
	type DragEvent,
	type KeyboardEvent,
	useCallback,
	useRef,
	useState,
} from "react";

// ============================================================================
// Types
// ============================================================================

/** A pending image attachment before sending. */
interface ImageAttachment {
	/** Unique ID for this attachment (for key and removal). */
	id: string;
	/** Base64-encoded image data (no data-URL prefix). */
	data: string;
	/** MIME type, e.g. "image/png", "image/jpeg". */
	mimeType: string;
	/** Data URL for preview rendering (data:mimeType;base64,data). */
	previewUrl: string;
}

/** Accepted image MIME types. */
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Maximum number of images that can be attached. */
const MAX_IMAGES = 10;

// ============================================================================
// Helpers
// ============================================================================

/** Extract a user-friendly error message. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

/** Maximum textarea height in pixels before scrolling. */
const MAX_TEXTAREA_HEIGHT = 200;

/** Auto-incrementing counter for image attachment IDs. */
let imageIdCounter = 0;

/**
 * Read a File (Blob) as a base64 string (without the data-URL prefix).
 * Returns the base64 data and the MIME type.
 */
function readFileAsBase64(file: File): Promise<{ data: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// result is "data:image/png;base64,iVBOR..." — extract after comma
			const commaIndex = result.indexOf(",");
			if (commaIndex === -1) {
				reject(new Error("Invalid data URL from FileReader"));
				return;
			}
			resolve({
				data: result.substring(commaIndex + 1),
				mimeType: file.type,
			});
		};
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

// ============================================================================
// Component
// ============================================================================

export function Composer() {
	const isStreaming = useStore((s) => s.isStreaming);
	const sessionId = useStore((s) => s.sessionId);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const setSessionId = useStore((s) => s.setSessionId);
	const setLastError = useStore((s) => s.setLastError);
	const addToast = useStore((s) => s.addToast);

	const [value, setValue] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [images, setImages] = useState<ImageAttachment[]>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const isConnected = connectionStatus === "open";
	const hasContent = value.trim().length > 0 || images.length > 0;
	const canSend = isConnected && hasContent && !isSending;

	/** Auto-resize textarea to fit content. */
	const resizeTextarea = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		// Reset height to auto to measure scrollHeight accurately
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
	}, []);

	/** Reset textarea and images after sending. */
	const clearInput = useCallback(() => {
		setValue("");
		setImages([]);
		requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			if (textarea) {
				textarea.style.height = "auto";
			}
		});
	}, []);

	/** Add images from a FileList (paste or drop). */
	const addImagesFromFiles = useCallback(
		async (files: FileList | File[]) => {
			const imageFiles = Array.from(files).filter((f) => ACCEPTED_IMAGE_TYPES.has(f.type));

			if (imageFiles.length === 0) return;

			const remaining = MAX_IMAGES - images.length;
			if (remaining <= 0) {
				addToast(`Maximum ${String(MAX_IMAGES)} images allowed`, "warning");
				return;
			}

			const filesToProcess = imageFiles.slice(0, remaining);
			if (filesToProcess.length < imageFiles.length) {
				addToast(`Only ${String(remaining)} more image(s) can be attached`, "warning");
			}

			try {
				const newAttachments: ImageAttachment[] = await Promise.all(
					filesToProcess.map(async (file) => {
						const { data, mimeType } = await readFileAsBase64(file);
						const id = `img-${String(++imageIdCounter)}`;
						return {
							id,
							data,
							mimeType,
							previewUrl: `data:${mimeType};base64,${data}`,
						};
					}),
				);
				setImages((prev) => [...prev, ...newAttachments]);
			} catch (err) {
				console.error("[Composer] Failed to read image:", err);
				addToast("Failed to read image", "error");
			}
		},
		[images.length, addToast],
	);

	/** Remove an image attachment by ID. */
	const removeImage = useCallback((id: string) => {
		setImages((prev) => prev.filter((img) => img.id !== id));
	}, []);

	/** Ensure a session exists, starting one if needed. Returns true if ready. */
	const ensureSession = useCallback(async (): Promise<boolean> => {
		if (sessionId) return true;
		try {
			const result = await getTransport().request("session.start", {});
			setSessionId(result.sessionId);
			// Multi-session: set active session + create/associate tab
			getTransport().setActiveSession(result.sessionId);
			{
				const s = useStore.getState();
				if (s.tabs.length === 0 || !s.activeTabId) {
					const tabId = s.addTab();
					s.switchTab(tabId);
				}
				// Re-read state after potential tab mutations
				const updated = useStore.getState();
				if (updated.activeTabId) {
					updated.updateTab(updated.activeTabId, { sessionId: result.sessionId });
				}
			}
			return true;
		} catch (err) {
			console.error("[Composer] Failed to start session:", err);
			setLastError(`Failed to start session: ${errorMessage(err)}`);
			return false;
		}
	}, [sessionId, setSessionId, setLastError]);

	/** Build the images param array for the WS request. */
	const buildImagesParam = useCallback(() => {
		if (images.length === 0) return undefined;
		return images.map((img) => ({ data: img.data, mimeType: img.mimeType }));
	}, [images]);

	/** Send the current message as a prompt (when not streaming). */
	const handleSend = useCallback(async () => {
		const message = value.trim();
		if (!hasContent || isSending) return;

		setIsSending(true);
		try {
			const ready = await ensureSession();
			if (!ready) return;

			const imagesParam = buildImagesParam();
			await getTransport().request("session.prompt", {
				message: message || " ",
				...(imagesParam && { images: imagesParam }),
			});
			clearInput();
		} catch (err) {
			console.error("[Composer] Failed to send prompt:", err);
			setLastError(`Failed to send message: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, hasContent, isSending, ensureSession, setLastError, clearInput, buildImagesParam]);

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

	/** Handle paste events — extract images from clipboard. */
	const handlePaste = useCallback(
		(e: ClipboardEvent<HTMLTextAreaElement>) => {
			const items = e.clipboardData?.items;
			if (!items) return;

			const imageFiles: File[] = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item && item.kind === "file" && ACCEPTED_IMAGE_TYPES.has(item.type)) {
					const file = item.getAsFile();
					if (file) {
						imageFiles.push(file);
					}
				}
			}

			if (imageFiles.length > 0) {
				// Prevent pasting file name text when we got an image
				e.preventDefault();
				addImagesFromFiles(imageFiles);
			}
			// If no image items, allow default paste (text)
		},
		[addImagesFromFiles],
	);

	/** Handle drag over events. */
	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	}, []);

	/** Handle drag leave events. */
	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	/** Handle drop events — extract images from dropped files. */
	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				addImagesFromFiles(files);
			}
		},
		[addImagesFromFiles],
	);

	/** Determine placeholder text based on current state. */
	const placeholder = !isConnected
		? "Connecting…"
		: isStreaming
			? "Enter to steer · Ctrl+Enter for follow-up…"
			: "Send a message… (paste images with Ctrl+V)";

	return (
		<div
			className={cn(
				"border-t bg-neutral-950 px-4 py-3",
				isDragOver ? "border-blue-500" : "border-neutral-800",
			)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="mx-auto max-w-3xl">
				{/* Image preview strip */}
				{images.length > 0 && (
					<div className="mb-2 flex flex-wrap gap-2">
						{images.map((img) => (
							<div
								key={img.id}
								className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900"
							>
								<img
									src={img.previewUrl}
									alt="Attachment preview"
									className="h-full w-full object-cover"
								/>
								{/* Remove button */}
								<button
									type="button"
									onClick={() => removeImage(img.id)}
									className={cn(
										"absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center",
										"rounded-full bg-neutral-800 text-neutral-400 shadow-sm",
										"opacity-0 transition-opacity group-hover:opacity-100",
										"hover:bg-red-600 hover:text-white",
									)}
									aria-label={`Remove image ${img.id}`}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 16 16"
										fill="currentColor"
										className="h-3 w-3"
										aria-label="Remove"
										role="img"
									>
										<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
									</svg>
								</button>
							</div>
						))}

						{/* Add more indicator (when under max) */}
						{images.length < MAX_IMAGES && (
							<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-700 text-neutral-600">
								<span className="text-xs">+</span>
							</div>
						)}
					</div>
				)}

				{/* Drag overlay hint */}
				{isDragOver && (
					<div className="mb-2 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-500/10 py-4">
						<p className="text-sm text-blue-400">Drop images here</p>
					</div>
				)}

				{/* Input row */}
				<div className="flex items-end gap-2">
					{/* Textarea */}
					<textarea
						ref={textareaRef}
						value={value}
						onChange={(e) => {
							setValue(e.target.value);
							resizeTextarea();
						}}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
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
					<div className="mt-1.5">
						<p className="text-xs text-neutral-500">
							<span className="text-blue-400">Enter</span> to steer ·{" "}
							<span className="text-blue-400">Ctrl+Enter</span> for follow-up ·{" "}
							<span className="text-red-400">Ctrl+C</span> to abort
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
