/**
 * ExtensionDialog — modal overlay for Pi extension UI dialog requests.
 *
 * Renders the appropriate dialog variant (select, confirm, input, editor)
 * based on the pending request in the Zustand store. Shows a modal backdrop
 * that blocks interaction with the rest of the app.
 *
 * Extension dialogs BLOCK Pi until a response is sent (MEMORY #14).
 * The dialog must be rendered promptly.
 *
 * Contains:
 * - useExtensionResponse hook — sends dialog responses back to Pi
 * - SelectDialog — option list picker
 * - ConfirmDialog — yes/no confirmation
 * - InputDialog — single-line text input
 * - EditorDialog — multi-line text editor
 * - ExtensionDialog — modal overlay + dispatcher
 */

import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type {
	PiExtensionConfirmRequest,
	PiExtensionEditorRequest,
	PiExtensionInputRequest,
	PiExtensionSelectRequest,
} from "@pibun/contracts";
import React, { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// useExtensionResponse — hook for sending responses back to Pi
// ============================================================================

/**
 * Returns response handlers for the current pending extension dialog.
 * Provides typed response functions (submit value, confirm, cancel)
 * and clears the pending dialog from the store after sending.
 */
function useExtensionResponse() {
	const clearPendingExtensionUi = useStore((s) => s.clearPendingExtensionUi);
	const setLastError = useStore((s) => s.setLastError);

	/** Send a value response (for select, input, editor). */
	const submitValue = useCallback(
		async (requestId: string, value: string) => {
			try {
				await getTransport().request("session.extensionUiResponse", {
					id: requestId,
					value,
				});
			} catch (err) {
				setLastError(
					`Extension response failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				clearPendingExtensionUi();
			}
		},
		[clearPendingExtensionUi, setLastError],
	);

	/** Send a confirmation response (for confirm dialogs). */
	const submitConfirm = useCallback(
		async (requestId: string, confirmed: boolean) => {
			try {
				await getTransport().request("session.extensionUiResponse", {
					id: requestId,
					confirmed,
				});
			} catch (err) {
				setLastError(
					`Extension response failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				clearPendingExtensionUi();
			}
		},
		[clearPendingExtensionUi, setLastError],
	);

	/** Cancel the dialog (works for all dialog types). */
	const cancel = useCallback(
		async (requestId: string) => {
			try {
				await getTransport().request("session.extensionUiResponse", {
					id: requestId,
					cancelled: true,
				});
			} catch (err) {
				setLastError(
					`Extension cancel failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				clearPendingExtensionUi();
			}
		},
		[clearPendingExtensionUi, setLastError],
	);

	return { submitValue, submitConfirm, cancel };
}

// ============================================================================
// SelectDialog
// ============================================================================

const SelectDialog = React.memo(function SelectDialog({
	request,
}: { request: PiExtensionSelectRequest }) {
	const { submitValue, cancel } = useExtensionResponse();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const handleSelect = useCallback(
		(option: string) => {
			submitValue(request.id, option);
		},
		[request.id, submitValue],
	);

	const handleCancel = useCallback(() => {
		cancel(request.id);
	}, [request.id, cancel]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			const optionCount = request.options.length;
			if (optionCount === 0) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, optionCount - 1)));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev === null ? optionCount - 1 : Math.max(prev - 1, 0)));
			} else if (e.key === "Enter" && selectedIndex !== null) {
				e.preventDefault();
				const option = request.options[selectedIndex];
				if (option !== undefined) {
					handleSelect(option);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		},
		[request.options, selectedIndex, handleSelect, handleCancel],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: dialog role for modal overlay
		<div role="dialog" aria-label={request.title} onKeyDown={handleKeyDown} tabIndex={-1}>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">{request.title}</h3>
			<div className="max-h-64 space-y-1 overflow-y-auto">
				{request.options.map((option, index) => (
					<button
						key={option}
						type="button"
						className={cn(
							"w-full rounded px-3 py-2 text-left text-sm transition-colors",
							index === selectedIndex
								? "bg-accent-soft text-accent-text"
								: "text-text-secondary hover:bg-surface-tertiary/50",
						)}
						onClick={() => handleSelect(option)}
						onMouseEnter={() => setSelectedIndex(index)}
					>
						{option}
					</button>
				))}
			</div>
			<div className="mt-4 flex justify-end">
				<button
					type="button"
					className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-tertiary/50 hover:text-text-primary"
					onClick={handleCancel}
				>
					Cancel
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// ConfirmDialog
// ============================================================================

const ConfirmDialog = React.memo(function ConfirmDialog({
	request,
}: { request: PiExtensionConfirmRequest }) {
	const { submitConfirm, cancel } = useExtensionResponse();
	const yesRef = useRef<HTMLButtonElement>(null);

	// Auto-focus the Yes button
	useEffect(() => {
		yesRef.current?.focus();
	}, []);

	const handleYes = useCallback(() => {
		submitConfirm(request.id, true);
	}, [request.id, submitConfirm]);

	const handleNo = useCallback(() => {
		submitConfirm(request.id, false);
	}, [request.id, submitConfirm]);

	const handleCancel = useCallback(() => {
		cancel(request.id);
	}, [request.id, cancel]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		},
		[handleCancel],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: dialog role for modal overlay
		<div role="dialog" aria-label={request.title} onKeyDown={handleKeyDown} tabIndex={-1}>
			<h3 className="mb-2 text-sm font-semibold text-text-primary">{request.title}</h3>
			<p className="mb-4 text-sm text-text-secondary">{request.message}</p>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-tertiary/50 hover:text-text-primary"
					onClick={handleNo}
				>
					No
				</button>
				<button
					ref={yesRef}
					type="button"
					className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
					onClick={handleYes}
				>
					Yes
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// InputDialog
// ============================================================================

const InputDialog = React.memo(function InputDialog({
	request,
}: { request: PiExtensionInputRequest }) {
	const { submitValue, cancel } = useExtensionResponse();
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-focus the input
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = useCallback(() => {
		submitValue(request.id, value);
	}, [request.id, value, submitValue]);

	const handleCancel = useCallback(() => {
		cancel(request.id);
	}, [request.id, cancel]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		},
		[handleSubmit, handleCancel],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: dialog role for modal overlay
		<div role="dialog" aria-label={request.title} onKeyDown={handleKeyDown} tabIndex={-1}>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">{request.title}</h3>
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={request.placeholder ?? ""}
				className="w-full rounded border border-border-primary bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
			/>
			<div className="mt-4 flex justify-end gap-2">
				<button
					type="button"
					className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-tertiary/50 hover:text-text-primary"
					onClick={handleCancel}
				>
					Cancel
				</button>
				<button
					type="button"
					className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
					onClick={handleSubmit}
				>
					Submit
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// EditorDialog
// ============================================================================

const EditorDialog = React.memo(function EditorDialog({
	request,
}: { request: PiExtensionEditorRequest }) {
	const { submitValue, cancel } = useExtensionResponse();
	const [value, setValue] = useState(request.prefill ?? "");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-focus the textarea and place cursor at end
	useEffect(() => {
		const el = textareaRef.current;
		if (el) {
			el.focus();
			el.setSelectionRange(el.value.length, el.value.length);
		}
	}, []);

	const handleSubmit = useCallback(() => {
		submitValue(request.id, value);
	}, [request.id, value, submitValue]);

	const handleCancel = useCallback(() => {
		cancel(request.id);
	}, [request.id, cancel]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Ctrl/Cmd + Enter to submit (Enter alone adds newline)
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		},
		[handleSubmit, handleCancel],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: dialog role for modal overlay
		<div role="dialog" aria-label={request.title} onKeyDown={handleKeyDown} tabIndex={-1}>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">{request.title}</h3>
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				rows={12}
				className="w-full resize-y rounded border border-border-primary bg-surface-secondary px-3 py-2 font-mono text-sm text-text-primary placeholder-text-tertiary outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
			/>
			<div className="mt-3 flex items-center justify-between">
				<span className="text-xs text-text-tertiary">
					{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to submit
				</span>
				<div className="flex gap-2">
					<button
						type="button"
						className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-tertiary/50 hover:text-text-primary"
						onClick={handleCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
						onClick={handleSubmit}
					>
						Submit
					</button>
				</div>
			</div>
		</div>
	);
});

// ============================================================================
// ExtensionDialog — modal overlay + dispatcher
// ============================================================================

export const ExtensionDialog = React.memo(function ExtensionDialog() {
	const pending = useStore((s) => s.pendingExtensionUi);
	const overlayRef = useRef<HTMLDivElement>(null);

	// Focus trap: focus the overlay on mount so keyboard events work
	useEffect(() => {
		if (pending) {
			overlayRef.current?.focus();
		}
	}, [pending]);

	if (!pending) return null;

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay backdrop-blur-sm"
			tabIndex={-1}
		>
			<div className="mx-4 w-full max-w-md rounded-lg border border-border-primary bg-surface-primary p-5 shadow-xl">
				{/* Extension source indicator */}
				<div className="mb-3 flex items-center gap-1.5 text-xs text-text-tertiary">
					<svg
						aria-label="Extension"
						role="img"
						className="h-3.5 w-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z"
						/>
					</svg>
					Extension Dialog
				</div>

				{/* Dialog body — dispatched by method type */}
				{pending.method === "select" && <SelectDialog request={pending} />}
				{pending.method === "confirm" && <ConfirmDialog request={pending} />}
				{pending.method === "input" && <InputDialog request={pending} />}
				{pending.method === "editor" && <EditorDialog request={pending} />}
			</div>
		</div>
	);
});
