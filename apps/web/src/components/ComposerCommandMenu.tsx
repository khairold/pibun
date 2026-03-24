/**
 * ComposerCommandMenu — floating autocomplete menu above the composer.
 *
 * Appears when the user types `/` at the start of a line. Shows available
 * Pi slash commands (extensions, skills, prompt templates) filtered by
 * the typed query. Keyboard navigable with ↑↓ + Enter + Escape.
 *
 * Design:
 * - Positioned absolutely above the composer's textarea
 * - Max height with scroll for many items
 * - Active item highlighted, auto-scrolled into view
 * - Shows command name, description, and source badge
 * - Empty state when no matches found
 * - Loading state while commands are being fetched
 *
 * @module
 */

import { cn } from "@/lib/utils";
import type { PiSlashCommand } from "@pibun/contracts";
import { memo, useEffect, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

/** A command menu item — wraps a PiSlashCommand with display metadata. */
export interface CommandMenuItem {
	/** Unique ID for this item (e.g., "cmd:extension:my-ext"). */
	id: string;
	/** The underlying Pi slash command. */
	command: PiSlashCommand;
	/** Display label (command name with leading slash). */
	label: string;
	/** Description text. */
	description: string;
	/** Source category for badge display. */
	source: "extension" | "prompt" | "skill";
}

/** Props for the ComposerCommandMenu. */
export interface ComposerCommandMenuProps {
	/** Filtered list of menu items to display. */
	items: CommandMenuItem[];
	/** ID of the currently highlighted item, null if none. */
	activeItemId: string | null;
	/** Whether commands are currently being fetched. */
	isLoading: boolean;
	/** Called when user selects an item (Enter or click). */
	onSelect: (item: CommandMenuItem) => void;
	/** Called when highlighted item changes (keyboard nav or hover). */
	onHighlightChange: (itemId: string | null) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build CommandMenuItems from PiSlashCommands. */
export function buildCommandMenuItems(commands: PiSlashCommand[]): CommandMenuItem[] {
	return commands.map((cmd) => ({
		id: `cmd:${cmd.source}:${cmd.name}`,
		command: cmd,
		label: `/${cmd.name}`,
		description: cmd.description ?? "",
		source: cmd.source,
	}));
}

/** Filter menu items by query string (case-insensitive match on name and description). */
export function filterCommandMenuItems(items: CommandMenuItem[], query: string): CommandMenuItem[] {
	if (!query) return items;
	const q = query.toLowerCase();
	return items.filter(
		(item) =>
			item.command.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q),
	);
}

/**
 * Detect a `/` slash command trigger from textarea value and cursor position.
 *
 * Returns the query text after the `/` (e.g., "mod" for "/mod") and the
 * range to replace when a command is selected. Returns null if the cursor
 * is not in a slash command trigger context.
 */
export function detectSlashTrigger(
	value: string,
	cursorPos: number,
): { query: string; rangeStart: number; rangeEnd: number } | null {
	// Find the start of the current line
	const lineStart = value.lastIndexOf("\n", Math.max(0, cursorPos - 1)) + 1;
	const linePrefix = value.slice(lineStart, cursorPos);

	// Must start with `/` and have no spaces (partial command name)
	if (!linePrefix.startsWith("/")) return null;
	// The command query is everything after the `/`, must not contain spaces
	const afterSlash = linePrefix.slice(1);
	if (/\s/.test(afterSlash)) return null;

	return {
		query: afterSlash,
		rangeStart: lineStart,
		rangeEnd: cursorPos,
	};
}

// ============================================================================
// Source badge colors
// ============================================================================

const SOURCE_STYLES: Record<string, string> = {
	extension: "bg-blue-500/15 text-blue-400",
	prompt: "bg-purple-500/15 text-purple-400",
	skill: "bg-emerald-500/15 text-emerald-400",
};

// ============================================================================
// Components
// ============================================================================

/** A single item in the command menu. */
const CommandMenuItemRow = memo(function CommandMenuItemRow(props: {
	item: CommandMenuItem;
	isActive: boolean;
	onSelect: (item: CommandMenuItem) => void;
	onHover: (itemId: string) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	// Auto-scroll active item into view
	useEffect(() => {
		if (props.isActive && ref.current) {
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [props.isActive]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav handled by parent Composer via ↑↓ Enter
		<div
			ref={ref}
			className={cn(
				"flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm",
				"transition-colors",
				props.isActive
					? "bg-accent-soft text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary",
			)}
			onMouseDown={(e) => {
				// Prevent textarea blur
				e.preventDefault();
			}}
			onClick={() => props.onSelect(props.item)}
			onMouseEnter={() => props.onHover(props.item.id)}
		>
			{/* Command icon — terminal slash */}
			<span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="Command"
					role="img"
				>
					<path d="M6.854 3.146a.5.5 0 0 1 0 .708L3.707 7H12.5a.5.5 0 0 1 0 1H3.707l3.147 3.146a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" />
				</svg>
			</span>

			{/* Label */}
			<span className="shrink-0 font-medium">{props.item.label}</span>

			{/* Description */}
			{props.item.description && (
				<span className="min-w-0 truncate text-xs text-text-muted">{props.item.description}</span>
			)}

			{/* Source badge */}
			<span
				className={cn(
					"ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
					SOURCE_STYLES[props.item.source] ?? "bg-surface-secondary text-text-muted",
				)}
			>
				{props.item.source}
			</span>
		</div>
	);
});

/**
 * ComposerCommandMenu — floating autocomplete for slash commands.
 *
 * This is a pure presentational component. The parent (Composer) manages:
 * - Trigger detection (when to show/hide)
 * - Keyboard event interception (↑↓ Enter Escape)
 * - Active item tracking
 * - Command fetching
 */
export const ComposerCommandMenu = memo(function ComposerCommandMenu(
	props: ComposerCommandMenuProps,
) {
	return (
		<div className="absolute bottom-full left-0 right-0 z-50 mb-1 px-4">
			<div className="mx-auto max-w-3xl">
				<div className="overflow-hidden rounded-xl border border-border-primary bg-surface-base shadow-lg">
					{/* Item list */}
					<div className="max-h-64 overflow-y-auto">
						{props.items.map((item) => (
							<CommandMenuItemRow
								key={item.id}
								item={item}
								isActive={props.activeItemId === item.id}
								onSelect={props.onSelect}
								onHover={props.onHighlightChange}
							/>
						))}
					</div>

					{/* Empty / loading states */}
					{props.items.length === 0 && (
						<div className="px-3 py-3 text-center text-xs text-text-muted">
							{props.isLoading ? "Loading commands…" : "No matching commands"}
						</div>
					)}
				</div>
			</div>
		</div>
	);
});
