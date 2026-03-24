/**
 * ForkDialog — lets the user fork the conversation from a previous message.
 *
 * Flow:
 * 1. User clicks "Fork" button → opens dropdown
 * 2. Fetches forkable messages from Pi via session.getForkMessages
 * 3. Shows a list of messages (truncated text previews)
 * 4. User clicks a message → calls forkFromMessage(entryId)
 * 5. Pi creates a new session branched at that point
 *
 * The dropdown closes on selection, Escape, or click-outside.
 */

import { forkFromMessage, getForkableMessages } from "@/lib/sessionActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { WsForkableMessage } from "@pibun/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

/** Max characters to show for each forkable message preview. */
const PREVIEW_MAX_CHARS = 80;

/** Truncate text for display, adding ellipsis if needed. */
function truncateText(text: string, maxLen: number): string {
	const cleaned = text.replace(/\n/g, " ").trim();
	if (cleaned.length <= maxLen) return cleaned;
	return `${cleaned.slice(0, maxLen)}…`;
}

export function ForkDialog() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const sessionId = useStore((s) => s.sessionId);

	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isForking, setIsForking] = useState(false);
	const [messages, setMessages] = useState<WsForkableMessage[]>([]);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;
	const isDisabled = !isConnected || !hasSession || isForking;

	// Fetch forkable messages when dropdown opens
	const handleOpen = useCallback(async () => {
		if (isDisabled) return;

		if (isOpen) {
			setIsOpen(false);
			return;
		}

		setIsOpen(true);
		setIsLoading(true);
		setMessages([]);

		const result = await getForkableMessages();
		setIsLoading(false);

		if (result) {
			setMessages(result);
		} else {
			// Error already shown via store.setLastError
			setIsOpen(false);
		}
	}, [isDisabled, isOpen]);

	// Fork from selected message
	const handleSelect = useCallback(async (entryId: string) => {
		setIsForking(true);
		setIsOpen(false);
		const success = await forkFromMessage(entryId);
		setIsForking(false);
		if (!success) {
			// Error already shown via store.setLastError
		}
	}, []);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// Close on click outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};

		// Use setTimeout to avoid the triggering click
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	return (
		<div className="relative" ref={dropdownRef}>
			{/* Trigger button */}
			<button
				type="button"
				onClick={handleOpen}
				disabled={isDisabled}
				title="Fork conversation from a previous message"
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
					isDisabled
						? "cursor-not-allowed text-text-muted"
						: "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
				)}
			>
				{/* Git branch icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="Fork conversation"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M4.75 2.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM2 3.75a2.75 2.75 0 1 1 3.5 2.646v.254A1.75 1.75 0 0 0 7.25 8.4h1.5A3.25 3.25 0 0 1 12 11.65v.254a2.751 2.751 0 1 1-1.5 0v-.254a1.75 1.75 0 0 0-1.75-1.75h-1.5a3.25 3.25 0 0 1-3.25-3.25v-.254A2.751 2.751 0 0 1 2 3.75zm9.5 7.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"
						clipRule="evenodd"
					/>
				</svg>
				{isForking ? "Forking…" : "Fork"}
			</button>

			{/* Dropdown */}
			{isOpen && (
				<div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-border-primary bg-surface-primary shadow-xl">
					{/* Header */}
					<div className="border-b border-border-secondary px-3 py-2">
						<p className="text-xs font-medium text-text-secondary">Fork from message</p>
						<p className="mt-0.5 text-xs text-text-tertiary">
							Create a new session branching from a previous point
						</p>
					</div>

					{/* Content */}
					<div className="max-h-64 overflow-y-auto">
						{isLoading && (
							<div className="flex items-center justify-center py-6">
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-text-secondary" />
								<span className="ml-2 text-xs text-text-tertiary">Loading messages…</span>
							</div>
						)}

						{!isLoading && messages.length === 0 && (
							<div className="px-3 py-6 text-center text-xs text-text-tertiary">
								No forkable messages found.
								<br />
								Start a conversation first.
							</div>
						)}

						{!isLoading &&
							messages.map((msg, index) => (
								<button
									key={msg.entryId}
									type="button"
									onClick={() => handleSelect(msg.entryId)}
									className={cn(
										"w-full px-3 py-2 text-left transition-colors hover:bg-surface-secondary",
										index < messages.length - 1 && "border-b border-border-muted",
									)}
								>
									<span className="block text-xs text-text-secondary">
										{truncateText(msg.text, PREVIEW_MAX_CHARS)}
									</span>
								</button>
							))}
					</div>
				</div>
			)}
		</div>
	);
}
