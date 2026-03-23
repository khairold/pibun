/**
 * ExtensionDialog — modal overlay for Pi extension UI dialog requests.
 *
 * Renders the appropriate dialog component (select, confirm, input, editor)
 * based on the pending request in the Zustand store. Shows a modal backdrop
 * that blocks interaction with the rest of the app.
 *
 * Extension dialogs BLOCK Pi until a response is sent (MEMORY #14).
 * The dialog must be rendered promptly.
 */

import { useStore } from "@/store";
import React, { useEffect, useRef } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditorDialog } from "./EditorDialog";
import { InputDialog } from "./InputDialog";
import { SelectDialog } from "./SelectDialog";

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
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			tabIndex={-1}
		>
			<div className="mx-4 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-850 p-5 shadow-xl">
				{/* Extension source indicator */}
				<div className="mb-3 flex items-center gap-1.5 text-xs text-neutral-500">
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
				{renderDialog(pending)}
			</div>
		</div>
	);
});

function renderDialog(
	request: NonNullable<ReturnType<typeof useStore.getState>["pendingExtensionUi"]>,
) {
	switch (request.method) {
		case "select":
			return <SelectDialog request={request} />;
		case "confirm":
			return <ConfirmDialog request={request} />;
		case "input":
			return <InputDialog request={request} />;
		case "editor":
			return <EditorDialog request={request} />;
	}
}
