/**
 * ThemeSelector — dropdown with theme previews + "System" auto option.
 *
 * Shows a palette icon as trigger. Opens a dropdown with:
 * 1. "System" option — follows OS dark/light mode via `prefers-color-scheme`
 * 2. Grid of theme preview cards for manual selection
 *
 * When "System" is active, a `matchMedia` listener watches for OS appearance
 * changes and auto-switches between "light" and "dark" themes in real time.
 * In desktop mode (Electrobun native webview), this fires when macOS
 * switches between Light and Dark Mode in System Settings.
 */

import { persistThemeToServer } from "@/lib/appActions";
import {
	THEME_LIST,
	THEME_STORAGE_KEY,
	applyTheme,
	getThemeById,
	resolveTheme,
	watchSystemPreference,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import type { Theme, ThemeId, ThemePreference } from "@pibun/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

/** Read the active theme preference from localStorage. */
function getActivePreference(): ThemePreference {
	const saved = localStorage.getItem(THEME_STORAGE_KEY);
	if (saved) return saved as ThemePreference;
	// No saved preference → default to "system" (follow OS)
	return "system";
}

/**
 * Mini color swatch preview — shows 5 key colors from a theme
 * to give users a quick visual impression.
 */
function ThemePreview({ theme, isActive }: { theme: Theme; isActive: boolean }) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all",
				isActive
					? "border-accent-primary ring-1 ring-accent-primary"
					: "border-border-primary hover:border-text-tertiary",
			)}
		>
			{/* Color swatch strip */}
			<div
				className="flex h-8 overflow-hidden rounded-md"
				style={{ backgroundColor: theme.colors["surface-base"] }}
			>
				{/* Surface layers */}
				<div className="flex-1" style={{ backgroundColor: theme.colors["surface-primary"] }} />
				<div className="flex-1" style={{ backgroundColor: theme.colors["surface-secondary"] }} />
				{/* Accent color */}
				<div className="flex-1" style={{ backgroundColor: theme.colors["accent-primary"] }} />
				{/* Text sample */}
				<div
					className="flex flex-1 items-center justify-center"
					style={{ backgroundColor: theme.colors["surface-primary"] }}
				>
					<span
						className="text-[8px] font-bold leading-none"
						style={{ color: theme.colors["text-primary"] }}
					>
						Aa
					</span>
				</div>
				{/* User bubble */}
				<div className="flex-1" style={{ backgroundColor: theme.colors["user-bubble-bg"] }} />
			</div>

			{/* Theme name + active indicator */}
			<div className="flex items-center gap-1.5">
				{isActive && (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3 shrink-0 text-accent-text"
						aria-label="Active theme"
						role="img"
					>
						<path
							fillRule="evenodd"
							d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z"
							clipRule="evenodd"
						/>
					</svg>
				)}
				<span
					className={cn(
						"text-xs font-medium",
						isActive ? "text-accent-text" : "text-text-secondary",
					)}
				>
					{theme.name}
				</span>
				{/* Light/dark badge */}
				<span className="ml-auto text-[9px] text-text-muted">
					{theme.isDark ? "Dark" : "Light"}
				</span>
			</div>
		</div>
	);
}

/**
 * "System" option preview — shows a split light/dark swatch.
 */
function SystemPreview({ isActive }: { isActive: boolean }) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all",
				isActive
					? "border-accent-primary ring-1 ring-accent-primary"
					: "border-border-primary hover:border-text-tertiary",
			)}
		>
			{/* Split swatch: light left / dark right */}
			<div className="flex h-8 overflow-hidden rounded-md">
				{/* Light half */}
				<div className="flex flex-1 items-center justify-center bg-white">
					<span className="text-[8px] font-bold leading-none text-neutral-900">Aa</span>
				</div>
				{/* Dark half */}
				<div className="flex flex-1 items-center justify-center bg-neutral-900">
					<span className="text-[8px] font-bold leading-none text-neutral-100">Aa</span>
				</div>
			</div>

			{/* Label */}
			<div className="flex items-center gap-1.5">
				{isActive && (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3 shrink-0 text-accent-text"
						aria-label="Active theme"
						role="img"
					>
						<path
							fillRule="evenodd"
							d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z"
							clipRule="evenodd"
						/>
					</svg>
				)}
				<span
					className={cn(
						"text-xs font-medium",
						isActive ? "text-accent-text" : "text-text-secondary",
					)}
				>
					System
				</span>
				{/* Auto badge */}
				<span className="ml-auto text-[9px] text-text-muted">Auto</span>
			</div>
		</div>
	);
}

export function ThemeSelector() {
	const [isOpen, setIsOpen] = useState(false);
	const [activePreference, setActivePreference] = useState<ThemePreference>(getActivePreference);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	// ── Watch system preference changes when "system" is active ───────
	useEffect(() => {
		if (activePreference !== "system") return;

		const unsubscribe = watchSystemPreference((systemThemeId: ThemeId) => {
			// OS changed dark/light mode — apply the matching theme
			const theme = getThemeById(systemThemeId);
			applyTheme(theme);
		});

		return unsubscribe;
	}, [activePreference]);

	// ── Select a specific theme ───────────────────────────────────────
	const handleSelectTheme = useCallback((theme: Theme) => {
		applyTheme(theme);
		setActivePreference(theme.id as ThemePreference);
		localStorage.setItem(THEME_STORAGE_KEY, theme.id);
		persistThemeToServer(theme.id as ThemePreference);
		setIsOpen(false);
	}, []);

	// ── Select "System" ───────────────────────────────────────────────
	const handleSelectSystem = useCallback(() => {
		setActivePreference("system");
		localStorage.setItem(THEME_STORAGE_KEY, "system");
		persistThemeToServer("system");
		// Apply the theme that matches the current OS preference
		applyTheme(resolveTheme("system"));
		setIsOpen(false);
	}, []);

	// ── Toggle dropdown ───────────────────────────────────────────────
	const handleToggle = useCallback(() => {
		setIsOpen((prev) => !prev);
	}, []);

	// ── Click-outside to close ────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(target) &&
				triggerRef.current &&
				!triggerRef.current.contains(target)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	// ── Escape to close ───────────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setIsOpen(false);
				triggerRef.current?.focus();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// ── Listen for external theme changes (e.g., cross-tab, server sync) ──
	useEffect(() => {
		function handleStorage(e: StorageEvent) {
			if (e.key === THEME_STORAGE_KEY && e.newValue) {
				const pref = e.newValue as ThemePreference;
				setActivePreference(pref);
				applyTheme(resolveTheme(pref));
			}
		}
		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	/** Check if a specific theme ID is the effectively active theme. */
	const isThemeActive = (themeId: string): boolean => {
		return activePreference === themeId;
	};

	return (
		<div className="relative">
			{/* Trigger button — palette icon */}
			<button
				ref={triggerRef}
				type="button"
				onClick={handleToggle}
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
					"border border-border-primary bg-surface-primary transition-colors",
					"text-text-primary hover:border-text-tertiary hover:bg-surface-secondary",
					isOpen && "border-text-tertiary bg-surface-secondary",
				)}
				title="Switch theme"
			>
				{/* Palette icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5 shrink-0"
					aria-label="Theme"
					role="img"
				>
					<path d="M8 1a7 7 0 0 0 0 14 1 1 0 0 0 1-1v-1.07a1 1 0 0 1 1-1h1.5A2.5 2.5 0 0 0 14 9.43V8A7 7 0 0 0 8 1zM5.5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM7 5.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3-1a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm2 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
				</svg>

				{/* Chevron */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-180")}
					aria-label="Toggle theme list"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"
						clipRule="evenodd"
					/>
				</svg>
			</button>

			{/* Dropdown panel — System option + theme grid */}
			{isOpen && (
				<div
					ref={dropdownRef}
					className={cn(
						"absolute right-0 top-full z-50 mt-1 w-72",
						"rounded-lg border border-border-primary bg-surface-primary shadow-xl",
					)}
				>
					{/* Header */}
					<div className="border-b border-border-secondary px-3 py-2">
						<span className="text-xs font-medium text-text-secondary">Theme</span>
					</div>

					{/* Theme list — System option first, then built-in themes */}
					<div className="flex flex-col gap-2 p-2">
						{/* System option */}
						<button
							type="button"
							onClick={handleSelectSystem}
							className="w-full cursor-pointer text-left"
						>
							<SystemPreview isActive={activePreference === "system"} />
						</button>

						{/* Divider */}
						<div className="border-t border-border-secondary" />

						{/* Built-in themes */}
						{THEME_LIST.map((theme) => (
							<button
								key={theme.id}
								type="button"
								onClick={() => handleSelectTheme(theme)}
								className="w-full cursor-pointer text-left"
							>
								<ThemePreview theme={theme} isActive={isThemeActive(theme.id)} />
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
