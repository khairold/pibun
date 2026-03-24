/**
 * ConfirmDialog — extension UI yes/no confirmation dialog.
 *
 * Renders a message with Yes/No buttons.
 * Submits the confirmed boolean back to Pi.
 */

import type { PiExtensionConfirmRequest } from "@pibun/contracts";
import React, { useCallback, useEffect, useRef } from "react";
import { useExtensionResponse } from "./useExtensionResponse";

interface ConfirmDialogProps {
	request: PiExtensionConfirmRequest;
}

export const ConfirmDialog = React.memo(function ConfirmDialog({ request }: ConfirmDialogProps) {
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
