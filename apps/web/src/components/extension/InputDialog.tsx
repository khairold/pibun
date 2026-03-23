/**
 * InputDialog — extension UI single-line text input dialog.
 *
 * Renders a text input field with submit/cancel buttons.
 * Submits the entered value back to Pi.
 */

import type { PiExtensionInputRequest } from "@pibun/contracts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useExtensionResponse } from "./useExtensionResponse";

interface InputDialogProps {
	request: PiExtensionInputRequest;
}

export const InputDialog = React.memo(function InputDialog({ request }: InputDialogProps) {
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
			<h3 className="mb-3 text-sm font-semibold text-neutral-100">{request.title}</h3>
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={request.placeholder ?? ""}
				className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
			/>
			<div className="mt-4 flex justify-end gap-2">
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
	);
});
