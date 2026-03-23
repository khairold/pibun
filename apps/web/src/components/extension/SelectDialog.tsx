/**
 * SelectDialog — extension UI select list dialog.
 *
 * Renders a list of options for the user to choose from.
 * Submits the selected value back to Pi.
 */

import { cn } from "@/lib/cn";
import type { PiExtensionSelectRequest } from "@pibun/contracts";
import React, { useCallback, useState } from "react";
import { useExtensionResponse } from "./useExtensionResponse";

interface SelectDialogProps {
	request: PiExtensionSelectRequest;
}

export const SelectDialog = React.memo(function SelectDialog({ request }: SelectDialogProps) {
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
			<h3 className="mb-3 text-sm font-semibold text-neutral-100">{request.title}</h3>
			<div className="max-h-64 space-y-1 overflow-y-auto">
				{request.options.map((option, index) => (
					<button
						key={option}
						type="button"
						className={cn(
							"w-full rounded px-3 py-2 text-left text-sm transition-colors",
							index === selectedIndex
								? "bg-blue-600/30 text-blue-200"
								: "text-neutral-300 hover:bg-neutral-700/50",
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
					className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200"
					onClick={handleCancel}
				>
					Cancel
				</button>
			</div>
		</div>
	);
});
