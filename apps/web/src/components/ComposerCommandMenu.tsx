/**
 * ComposerCommandMenu — floating autocomplete menus above the composer.
 *
 * Contains three menu systems:
 * 1. **Slash command menu** — `/` at line start shows Pi commands
 * 2. **File mention menu** — `@` anywhere shows project file search results
 * 3. **Model picker** — inline model selector shown when `/model` is selected
 *
 * Design:
 * - Positioned absolutely above the composer's textarea
 * - Max height with scroll for many items
 * - Active item highlighted, auto-scrolled into view
 * - Keyboard navigable with ↑↓ + Enter + Escape
 * - Loading and empty states for async searches
 *
 * @module
 */

import { cn } from "@/lib/utils";
import type { FileSearchResult, PiModel, PiSlashCommand } from "@pibun/contracts";
import { memo, useEffect, useMemo, useRef } from "react";

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

/**
 * Detect an `@` file mention trigger from textarea value and cursor position.
 *
 * Unlike slash triggers (which must be at line start), `@` can appear anywhere
 * in the text — it triggers when the cursor is inside a word that starts with `@`.
 * The query is everything after `@` until the cursor (no whitespace allowed).
 *
 * Returns null if the cursor is not in an `@` trigger context.
 */
export function detectAtTrigger(
	value: string,
	cursorPos: number,
): { query: string; rangeStart: number; rangeEnd: number } | null {
	// Walk backwards from cursor to find the start of the current token
	let tokenStart = cursorPos - 1;
	while (tokenStart >= 0 && !/\s/.test(value[tokenStart] ?? "")) {
		tokenStart--;
	}
	tokenStart++; // move past the whitespace (or -1 → 0)

	const token = value.slice(tokenStart, cursorPos);
	if (!token.startsWith("@")) return null;

	// The query is everything after `@`
	const query = token.slice(1);

	return {
		query,
		rangeStart: tokenStart,
		rangeEnd: cursorPos,
	};
}

/** A file mention menu item — wraps a FileSearchResult with display metadata. */
export interface FileMentionMenuItem {
	/** Unique ID for this item. */
	id: string;
	/** The file search result. */
	file: FileSearchResult;
	/** Display label — the filename (last segment of path). */
	label: string;
	/** Full relative path from project root. */
	path: string;
}

/** Build FileMentionMenuItems from FileSearchResults. */
export function buildFileMentionItems(files: FileSearchResult[]): FileMentionMenuItem[] {
	return files.map((file, i) => {
		const segments = file.path.split("/");
		const label = segments[segments.length - 1] ?? file.path;
		return {
			id: `file:${String(i)}:${file.path}`,
			file,
			label,
			path: file.path,
		};
	});
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

// ============================================================================
// File Mention Menu — file search results for @ mentions
// ============================================================================

/** Props for the FileMentionMenu. */
export interface FileMentionMenuProps {
	/** File search result items to display. */
	items: FileMentionMenuItem[];
	/** ID of the currently highlighted item, null if none. */
	activeItemId: string | null;
	/** Whether a search is currently in progress. */
	isLoading: boolean;
	/** Called when user selects an item (Enter or click). */
	onSelect: (item: FileMentionMenuItem) => void;
	/** Called when highlighted item changes (keyboard nav or hover). */
	onHighlightChange: (itemId: string | null) => void;
}

/** File/directory kind icon. */
const FileKindIcon = memo(function FileKindIcon(props: { kind: "file" | "directory" }) {
	if (props.kind === "directory") {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5"
				aria-label="Directory"
				role="img"
			>
				<path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z" />
			</svg>
		);
	}
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="h-3.5 w-3.5"
			aria-label="File"
			role="img"
		>
			<path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z" />
		</svg>
	);
});

/** A single item in the file mention menu. */
const FileMentionItemRow = memo(function FileMentionItemRow(props: {
	item: FileMentionMenuItem;
	isActive: boolean;
	onSelect: (item: FileMentionMenuItem) => void;
	onHover: (itemId: string) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	// Auto-scroll active item into view
	useEffect(() => {
		if (props.isActive && ref.current) {
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [props.isActive]);

	// Split path into directory and filename for display
	const lastSlash = props.item.path.lastIndexOf("/");
	const dir = lastSlash >= 0 ? props.item.path.slice(0, lastSlash + 1) : "";
	const name = lastSlash >= 0 ? props.item.path.slice(lastSlash + 1) : props.item.path;

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav handled by parent Composer via ↑↓ Enter
		<div
			ref={ref}
			className={cn(
				"flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-sm",
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
			{/* File/directory icon */}
			<span
				className={cn(
					"flex h-5 w-5 shrink-0 items-center justify-center",
					props.item.file.kind === "directory" ? "text-accent-text" : "text-text-muted",
				)}
			>
				<FileKindIcon kind={props.item.file.kind} />
			</span>

			{/* Path — directory in muted, filename in normal weight */}
			<span className="min-w-0 truncate">
				{dir && <span className="text-xs text-text-muted">{dir}</span>}
				<span className="text-xs font-medium">{name}</span>
			</span>
		</div>
	);
});

/**
 * FileMentionMenu — floating autocomplete for @file mentions.
 *
 * Pure presentational component. The parent (Composer) manages:
 * - Trigger detection (when to show/hide)
 * - Debounced file search requests
 * - Keyboard event interception (↑↓ Enter Escape)
 * - Active item tracking
 */
export const FileMentionMenu = memo(function FileMentionMenu(props: FileMentionMenuProps) {
	return (
		<div className="absolute bottom-full left-0 right-0 z-50 mb-1 px-4">
			<div className="mx-auto max-w-3xl">
				<div className="overflow-hidden rounded-xl border border-border-primary bg-surface-base shadow-lg">
					{/* Header */}
					<div className="flex items-center justify-between border-b border-border-secondary px-3 py-1.5">
						<span className="text-[10px] font-medium text-text-secondary">File Mention</span>
						<span className="text-[10px] text-text-tertiary">
							↑↓ navigate · Enter select · Esc cancel
						</span>
					</div>

					{/* Item list */}
					<div className="max-h-64 overflow-y-auto">
						{props.items.map((item) => (
							<FileMentionItemRow
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
							{props.isLoading ? "Searching files…" : "No matching files"}
						</div>
					)}
				</div>
			</div>
		</div>
	);
});

// ============================================================================
// Model Picker — inline model selector shown when /model is selected
// ============================================================================

/** Group models by provider name. */
function groupByProvider(models: readonly PiModel[]): Map<string, PiModel[]> {
	const groups = new Map<string, PiModel[]>();
	for (const model of models) {
		const provider = model.provider || "unknown";
		let group = groups.get(provider);
		if (!group) {
			group = [];
			groups.set(provider, group);
		}
		group.push(model);
	}
	return groups;
}

/** Format provider name for display (capitalize first letter). */
function providerLabel(provider: string): string {
	if (provider.length === 0) return "Unknown";
	return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Props for the ComposerModelPicker. */
export interface ComposerModelPickerProps {
	/** Available models to show. */
	models: readonly PiModel[];
	/** Whether models are currently being fetched. */
	isLoading: boolean;
	/** Currently active model (for highlight). */
	currentModel: PiModel | null;
	/** Index of the currently highlighted item. */
	activeIndex: number;
	/** Called when user selects a model. */
	onSelect: (model: PiModel) => void;
	/** Called to dismiss the picker. */
	onDismiss: () => void;
	/** Called when highlighted index changes. */
	onHighlightChange: (index: number) => void;
}

/** A single model row in the picker. */
const ModelPickerRow = memo(function ModelPickerRow(props: {
	model: PiModel;
	isActive: boolean;
	isCurrent: boolean;
	onSelect: (model: PiModel) => void;
	onHover: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (props.isActive && ref.current) {
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [props.isActive]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav handled by parent Composer
		<div
			ref={ref}
			className={cn(
				"flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-sm",
				"transition-colors",
				props.isActive
					? "bg-accent-soft text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary",
			)}
			onMouseDown={(e) => e.preventDefault()}
			onClick={() => props.onSelect(props.model)}
			onMouseEnter={props.onHover}
		>
			{/* Current indicator */}
			<span
				className={cn(
					"h-1.5 w-1.5 shrink-0 rounded-full",
					props.isCurrent ? "bg-accent-text" : "bg-transparent",
				)}
			/>

			{/* Model info */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-xs font-medium">{props.model.name || props.model.id}</span>
					{props.model.reasoning && (
						<span className="shrink-0 rounded bg-status-warning-bg px-1 py-0.5 text-[9px] font-medium text-status-warning-text">
							reasoning
						</span>
					)}
					{props.model.input.includes("image") && (
						<span className="shrink-0 rounded bg-status-success-bg px-1 py-0.5 text-[9px] font-medium text-status-success-text">
							vision
						</span>
					)}
				</div>
				<div className="mt-0.5 text-[10px] text-text-tertiary">
					{props.model.id}
					{props.model.contextWindow > 0 && (
						<>
							{" · "}
							{Math.round(props.model.contextWindow / 1000)}k ctx
						</>
					)}
				</div>
			</div>
		</div>
	);
});

/**
 * ComposerModelPicker — inline model selector in the floating menu area.
 *
 * Shows when `/model` is selected from the command menu.
 * Grouped by provider, keyboard navigable (↑↓ Enter Escape).
 */
export const ComposerModelPicker = memo(function ComposerModelPicker(
	props: ComposerModelPickerProps,
) {
	/** Flat list of models for keyboard navigation indexing. */
	const flatModels = useMemo(() => [...props.models], [props.models]);
	const grouped = useMemo(() => groupByProvider(props.models), [props.models]);

	// Build flat-index offset per provider group
	let flatIndex = 0;

	return (
		<div className="absolute bottom-full left-0 right-0 z-50 mb-1 px-4">
			<div className="mx-auto max-w-3xl">
				<div className="overflow-hidden rounded-xl border border-border-primary bg-surface-base shadow-lg">
					{/* Header */}
					<div className="flex items-center justify-between border-b border-border-secondary px-3 py-2">
						<span className="text-xs font-medium text-text-secondary">Switch Model</span>
						<span className="text-[10px] text-text-tertiary">
							↑↓ navigate · Enter select · Esc cancel
						</span>
					</div>

					{/* Model list */}
					<div className="max-h-80 overflow-y-auto py-1">
						{props.isLoading && flatModels.length === 0 && (
							<div className="px-3 py-3 text-center text-xs text-text-muted">Loading models…</div>
						)}

						{!props.isLoading && flatModels.length === 0 && (
							<div className="px-3 py-3 text-center text-xs text-text-muted">
								No models available
							</div>
						)}

						{[...grouped.entries()].map(([provider, models]) => {
							const groupStart = flatIndex;
							flatIndex += models.length;
							return (
								<div key={provider}>
									<div className="px-3 pb-1 pt-2">
										<span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
											{providerLabel(provider)}
										</span>
									</div>
									{models.map((model, i) => {
										const modelFlatIndex = groupStart + i;
										const isCurrent =
											props.currentModel?.id === model.id &&
											props.currentModel?.provider === model.provider;
										return (
											<ModelPickerRow
												key={`${model.provider}-${model.id}`}
												model={model}
												isActive={modelFlatIndex === props.activeIndex}
												isCurrent={isCurrent}
												onSelect={props.onSelect}
												onHover={() => props.onHighlightChange(modelFlatIndex)}
											/>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
});
