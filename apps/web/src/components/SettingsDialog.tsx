/**
 * SettingsDialog — modal dialog for app preferences.
 *
 * Accessible via Ctrl/Cmd+, or the gear icon in the toolbar.
 * Sections:
 * - Appearance: theme selector
 * - Agent: auto-compaction toggle, auto-retry toggle
 * - Display: timestamp format selector
 *
 * Settings persist to `~/.pibun/settings.json` on the server and
 * to localStorage as a fallback. Changes are applied immediately.
 */

import { getSettings, persistThemeToServer, updateSetting } from "@/lib/appActions";
import {
	THEME_LIST,
	THEME_STORAGE_KEY,
	applyTheme,
	getThemeById,
	resolveTheme,
	watchSystemPreference,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type {
	PiFollowUpMode,
	PiSteeringMode,
	Theme,
	ThemePreference,
	TimestampFormat,
} from "@pibun/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Shared: Checkmark icon
// ============================================================================

function CheckIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="ml-auto h-4 w-4 shrink-0 text-accent-text"
			aria-label="Selected"
			role="img"
		>
			<path
				fillRule="evenodd"
				d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

// ============================================================================
// Section: Appearance
// ============================================================================

/** Read the active theme preference from localStorage. */
function getActivePreference(): ThemePreference {
	const saved = localStorage.getItem(THEME_STORAGE_KEY);
	if (saved) return saved as ThemePreference;
	return "system";
}

/** Compact theme swatch — smaller than ThemeSelector's preview. */
function ThemeSwatch({
	theme,
	isActive,
	onClick,
}: { theme: Theme; isActive: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all",
				isActive
					? "border-accent-primary bg-accent-soft"
					: "border-border-primary hover:border-text-tertiary hover:bg-surface-secondary",
			)}
		>
			{/* Color swatch strip */}
			<div
				className="flex h-6 w-16 shrink-0 overflow-hidden rounded"
				style={{ backgroundColor: theme.colors["surface-base"] }}
			>
				<div className="flex-1" style={{ backgroundColor: theme.colors["surface-primary"] }} />
				<div className="flex-1" style={{ backgroundColor: theme.colors["accent-primary"] }} />
				<div className="flex-1" style={{ backgroundColor: theme.colors["surface-secondary"] }} />
			</div>
			<div className="flex flex-col items-start">
				<span
					className={cn("text-xs font-medium", isActive ? "text-accent-text" : "text-text-primary")}
				>
					{theme.name}
				</span>
				<span className="text-[10px] text-text-muted">{theme.isDark ? "Dark" : "Light"}</span>
			</div>
			{isActive && <CheckIcon />}
		</button>
	);
}

function AppearanceSection() {
	const [activePreference, setActivePreference] = useState<ThemePreference>(getActivePreference);

	// Watch system preference changes when "system" is active
	useEffect(() => {
		if (activePreference !== "system") return;
		return watchSystemPreference((systemThemeId) => {
			applyTheme(getThemeById(systemThemeId));
		});
	}, [activePreference]);

	const handleSelectTheme = useCallback((theme: Theme) => {
		applyTheme(theme);
		setActivePreference(theme.id as ThemePreference);
		localStorage.setItem(THEME_STORAGE_KEY, theme.id);
		persistThemeToServer(theme.id as ThemePreference);
	}, []);

	const handleSelectSystem = useCallback(() => {
		setActivePreference("system");
		localStorage.setItem(THEME_STORAGE_KEY, "system");
		persistThemeToServer("system");
		applyTheme(resolveTheme("system"));
	}, []);

	return (
		<section>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">Appearance</h3>

			<span className="mb-2 block text-xs font-medium text-text-secondary">Theme</span>

			<div className="flex flex-col gap-1.5">
				{/* System option */}
				<button
					type="button"
					onClick={handleSelectSystem}
					className={cn(
						"flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
						activePreference === "system"
							? "border-accent-primary bg-accent-soft"
							: "border-border-primary hover:border-text-tertiary hover:bg-surface-secondary",
					)}
				>
					{/* Split swatch */}
					<div className="flex h-6 w-16 shrink-0 overflow-hidden rounded">
						<div className="flex flex-1 items-center justify-center bg-white">
							<span className="text-[7px] font-bold text-neutral-900">A</span>
						</div>
						<div className="flex flex-1 items-center justify-center bg-neutral-900">
							<span className="text-[7px] font-bold text-neutral-100">A</span>
						</div>
					</div>
					<div className="flex flex-col items-start">
						<span
							className={cn(
								"text-xs font-medium",
								activePreference === "system" ? "text-accent-text" : "text-text-primary",
							)}
						>
							System
						</span>
						<span className="text-[10px] text-text-muted">Follow OS preference</span>
					</div>
					{activePreference === "system" && <CheckIcon />}
				</button>

				{/* Theme list */}
				{THEME_LIST.map((theme) => (
					<ThemeSwatch
						key={theme.id}
						theme={theme}
						isActive={activePreference === theme.id}
						onClick={() => handleSelectTheme(theme)}
					/>
				))}
			</div>
		</section>
	);
}

// ============================================================================
// Section: Agent Behavior
// ============================================================================

function ToggleSwitch({
	checked,
	onChange,
	label,
	description,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="min-w-0">
				<div className="text-xs font-medium text-text-primary">{label}</div>
				<div className="mt-0.5 text-[11px] text-text-tertiary">{description}</div>
			</div>
			<button
				type="button"
				onClick={() => onChange(!checked)}
				aria-label={`${label}: ${checked ? "enabled" : "disabled"}`}
				className={cn(
					"relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
					checked ? "bg-accent-primary" : "bg-border-primary",
				)}
			>
				<span
					className={cn(
						"inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
						checked ? "translate-x-[18px]" : "translate-x-[3px]",
					)}
				/>
			</button>
		</div>
	);
}

/** Inline segmented control for choosing between two modes. */
function ModeSelector<T extends string>({
	value,
	onChange,
	label,
	description,
	options,
}: {
	value: T;
	onChange: (value: T) => void;
	label: string;
	description: string;
	options: { value: T; label: string }[];
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="min-w-0">
				<div className="text-xs font-medium text-text-primary">{label}</div>
				<div className="mt-0.5 text-[11px] text-text-tertiary">{description}</div>
			</div>
			<div className="flex shrink-0 overflow-hidden rounded-md border border-border-primary">
				{options.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => onChange(opt.value)}
						className={cn(
							"px-2.5 py-1 text-[11px] font-medium transition-colors",
							value === opt.value
								? "bg-accent-primary text-text-on-accent"
								: "bg-surface-primary text-text-secondary hover:bg-surface-secondary",
						)}
					>
						{opt.label}
					</button>
				))}
			</div>
		</div>
	);
}

const DELIVERY_MODE_OPTIONS: { value: "all" | "one-at-a-time"; label: string }[] = [
	{ value: "one-at-a-time", label: "One at a time" },
	{ value: "all", label: "All" },
];

function AgentSection() {
	const settings = getSettings();
	const [autoCompaction, setAutoCompaction] = useState(settings.autoCompaction !== false);
	const [autoRetry, setAutoRetry] = useState(settings.autoRetry !== false);
	const [steeringMode, setSteeringMode] = useState<PiSteeringMode>(
		settings.steeringMode ?? "one-at-a-time",
	);
	const [followUpMode, setFollowUpMode] = useState<PiFollowUpMode>(
		settings.followUpMode ?? "one-at-a-time",
	);

	const handleAutoCompaction = useCallback((checked: boolean) => {
		setAutoCompaction(checked);
		updateSetting("autoCompaction", checked);
	}, []);

	const handleAutoRetry = useCallback((checked: boolean) => {
		setAutoRetry(checked);
		updateSetting("autoRetry", checked);
	}, []);

	const handleSteeringMode = useCallback((mode: PiSteeringMode) => {
		setSteeringMode(mode);
		updateSetting("steeringMode", mode);
	}, []);

	const handleFollowUpMode = useCallback((mode: PiFollowUpMode) => {
		setFollowUpMode(mode);
		updateSetting("followUpMode", mode);
	}, []);

	return (
		<section>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">Agent Behavior</h3>
			<div className="flex flex-col gap-3">
				<ToggleSwitch
					checked={autoCompaction}
					onChange={handleAutoCompaction}
					label="Auto-compaction"
					description="Automatically compact context when it approaches the model's limit"
				/>
				<ToggleSwitch
					checked={autoRetry}
					onChange={handleAutoRetry}
					label="Auto-retry"
					description="Automatically retry on transient API errors (rate limits, timeouts)"
				/>
				<ModeSelector
					value={steeringMode}
					onChange={handleSteeringMode}
					label="Steering mode"
					description="How queued steering messages are delivered between turns"
					options={DELIVERY_MODE_OPTIONS}
				/>
				<ModeSelector
					value={followUpMode}
					onChange={handleFollowUpMode}
					label="Follow-up mode"
					description="How queued follow-up messages are delivered after agent finishes"
					options={DELIVERY_MODE_OPTIONS}
				/>
			</div>
		</section>
	);
}

// ============================================================================
// Section: Display
// ============================================================================

const TIMESTAMP_OPTIONS: { value: TimestampFormat; label: string; example: string }[] = [
	{ value: "relative", label: "Relative", example: "2m ago" },
	{ value: "locale", label: "Locale", example: new Date().toLocaleTimeString() },
	{
		value: "12h",
		label: "12-hour",
		example: new Date().toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		}),
	},
	{
		value: "24h",
		label: "24-hour",
		example: new Date().toLocaleTimeString("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}),
	},
];

function DisplaySection() {
	const settings = getSettings();
	const [timestampFormat, setTimestampFormat] = useState<TimestampFormat>(settings.timestampFormat);

	const handleTimestampFormat = useCallback((format: TimestampFormat) => {
		setTimestampFormat(format);
		updateSetting("timestampFormat", format);
	}, []);

	return (
		<section>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">Display</h3>
			<span className="mb-2 block text-xs font-medium text-text-secondary">Timestamp Format</span>
			<div className="flex flex-col gap-1">
				{TIMESTAMP_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => handleTimestampFormat(opt.value)}
						className={cn(
							"flex items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors",
							timestampFormat === opt.value
								? "bg-accent-soft text-accent-text"
								: "text-text-secondary hover:bg-surface-secondary",
						)}
					>
						<span className="font-medium">{opt.label}</span>
						<span className="text-text-muted">{opt.example}</span>
					</button>
				))}
			</div>
		</section>
	);
}

// ============================================================================
// Section: Keyboard Shortcuts
// ============================================================================

const SHORTCUTS: { keys: string; description: string }[] = [
	{ keys: "⌘/Ctrl+,", description: "Settings" },
	{ keys: "⌘/Ctrl+B", description: "Toggle sidebar" },
	{ keys: "⌘/Ctrl+L", description: "Switch model" },
	{ keys: "⌘/Ctrl+N", description: "New session" },
	{ keys: "⌘/Ctrl+T", description: "New tab" },
	{ keys: "⌘/Ctrl+W", description: "Close tab" },
	{ keys: "⌘/Ctrl+`", description: "Toggle terminal" },
	{ keys: "⌘/Ctrl+G", description: "Toggle git panel" },
	{ keys: "⌘/Ctrl+Shift+K", description: "Compact context" },
	{ keys: "⌘/Ctrl+Shift+T", description: "Toggle thinking selector" },
	{ keys: "⌘/Ctrl+Shift+E", description: "Export session" },
	{ keys: "⌘/Ctrl+Tab", description: "Next tab" },
	{ keys: "⌘/Ctrl+Shift+Tab", description: "Previous tab" },
	{ keys: "⌘/Ctrl+1-9", description: "Jump to tab" },
];

function ShortcutsSection() {
	return (
		<section>
			<h3 className="mb-3 text-sm font-semibold text-text-primary">Keyboard Shortcuts</h3>
			<div className="flex flex-col gap-0.5">
				{SHORTCUTS.map((s) => (
					<div key={s.keys} className="flex items-center justify-between rounded-md px-2 py-1.5">
						<span className="text-xs text-text-secondary">{s.description}</span>
						<kbd className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
							{s.keys}
						</kbd>
					</div>
				))}
			</div>
		</section>
	);
}

// ============================================================================
// Main Dialog
// ============================================================================

export function SettingsDialog() {
	const settingsOpen = useStore((s) => s.settingsOpen);
	const setSettingsOpen = useStore((s) => s.setSettingsOpen);
	const panelRef = useRef<HTMLDivElement>(null);

	// Close on Escape
	useEffect(() => {
		if (!settingsOpen) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setSettingsOpen(false);
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [settingsOpen, setSettingsOpen]);

	const handleBackdropClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (e.target === e.currentTarget) {
				setSettingsOpen(false);
			}
		},
		[setSettingsOpen],
	);

	if (!settingsOpen) return null;

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled via document keydown listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onClick={handleBackdropClick}
		>
			<div
				ref={panelRef}
				className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-primary bg-surface-primary shadow-2xl"
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border-secondary px-5 py-3.5">
					<h2 className="text-sm font-semibold text-text-primary">Settings</h2>
					<button
						type="button"
						onClick={() => setSettingsOpen(false)}
						className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
						title="Close (Escape)"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-4 w-4"
							aria-label="Close"
							role="img"
						>
							<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
						</svg>
					</button>
				</div>

				{/* Content — scrollable */}
				<div className="flex-1 overflow-y-auto px-5 py-4">
					<div className="flex flex-col gap-6">
						<AppearanceSection />
						<div className="border-t border-border-secondary" />
						<AgentSection />
						<div className="border-t border-border-secondary" />
						<DisplaySection />
						<div className="border-t border-border-secondary" />
						<ShortcutsSection />
					</div>
				</div>

				{/* Footer */}
				<div className="border-t border-border-secondary px-5 py-3">
					<p className="text-[10px] text-text-muted">
						Settings are saved automatically. Keyboard shortcut: ⌘/Ctrl+,
					</p>
				</div>
			</div>
		</div>
	);
}
