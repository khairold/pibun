/**
 * EditorDialog — extension UI multi-line text editor dialog.
 *
 * Renders a textarea with optional prefilled content.
 * Submits the edited text back to Pi.
 */

import type { PiExtensionEditorRequest } from "@pibun/contracts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useExtensionResponse } from "./useExtensionResponse";

interface EditorDialogProps {
	request: PiExtensionEditorRequest;
}

export const EditorDialog = React.memo(function EditorDialog({ request }: EditorDialogProps) {
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
			<h3 className="mb-3 text-sm font-semibold text-neutral-100">{request.title}</h3>
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				rows={12}
				className="w-full resize-y rounded border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
			/>
			<div className="mt-3 flex items-center justify-between">
				<span className="text-xs text-neutral-500">
					{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to submit
				</span>
				<div className="flex gap-2">
					<button
						type="button"
						className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200"
						onClick={handleCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
						onClick={handleSubmit}
					>
						Submit
					</button>
				</div>
			</div>
		</div>
	);
});
