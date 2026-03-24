/**
 * Built-in theme definitions — 5 themes covering light, dark, and high-contrast.
 *
 * Each theme maps semantic color tokens to CSS color values. These are injected
 * as CSS custom properties (`--color-{token}`) on the `<html>` element.
 *
 * Token naming convention follows the {@link ThemeColors} interface in contracts.
 *
 * @module
 */

import type { Theme, ThemeId } from "@pibun/contracts";

// ============================================================================
// Dark (default) — matches the current hardcoded neutral palette
// ============================================================================

const dark: Theme = {
	id: "dark",
	name: "Dark",
	isDark: true,
	shikiTheme: "github-dark-default",
	colors: {
		// Surface
		"surface-base": "#0a0a0a", // neutral-950
		"surface-primary": "#171717", // neutral-900
		"surface-secondary": "#262626", // neutral-800
		"surface-tertiary": "#404040", // neutral-700
		"surface-overlay": "rgba(23, 23, 23, 0.5)", // neutral-900/50

		// Text
		"text-primary": "#f5f5f5", // neutral-100
		"text-secondary": "#d4d4d4", // neutral-300
		"text-tertiary": "#a3a3a3", // neutral-500
		"text-muted": "#525252", // neutral-600
		"text-on-accent": "#ffffff",

		// Border
		"border-primary": "#404040", // neutral-700
		"border-secondary": "#262626", // neutral-800
		"border-muted": "rgba(38, 38, 38, 0.5)", // neutral-800/50

		// Accent (blue)
		"accent-primary": "#3b82f6", // blue-500
		"accent-primary-hover": "#2563eb", // blue-600
		"accent-soft": "rgba(96, 165, 250, 0.1)", // blue-400/10
		"accent-text": "#60a5fa", // blue-400

		// Error (red)
		"status-error": "#ef4444", // red-500
		"status-error-bg": "#450a0a", // red-950
		"status-error-text": "#fca5a5", // red-300
		"status-error-border": "rgba(239, 68, 68, 0.3)", // red-500/30

		// Success (green)
		"status-success": "#22c55e", // green-500
		"status-success-bg": "rgba(20, 83, 45, 0.4)", // green-900/40
		"status-success-text": "#4ade80", // green-400
		"status-success-border": "rgba(21, 128, 61, 0.5)", // green-700/50

		// Warning (amber)
		"status-warning": "#f59e0b", // amber-500
		"status-warning-bg": "rgba(120, 53, 15, 0.5)", // amber-900/50
		"status-warning-text": "#fbbf24", // amber-400

		// Info (blue)
		"status-info": "#3b82f6", // blue-500
		"status-info-bg": "rgba(37, 99, 235, 0.15)", // blue-600/15
		"status-info-text": "#60a5fa", // blue-400

		// Thinking (indigo)
		"thinking-bg": "rgba(99, 102, 241, 0.1)", // indigo-500/10
		"thinking-border": "rgba(99, 102, 241, 0.3)", // indigo-500/30
		"thinking-text": "#a5b4fc", // indigo-300

		// Code
		"code-bg": "#0a0a0a", // neutral-950
		"code-inline-bg": "#262626", // neutral-800

		// User bubble
		"user-bubble-bg": "#3b82f6", // blue-500
		"user-bubble-text": "#ffffff",

		// Scrollbar
		"scrollbar-thumb": "#404040", // neutral-700
		"scrollbar-track": "transparent",
	},
};

// ============================================================================
// Light — clean white/gray palette
// ============================================================================

const light: Theme = {
	id: "light",
	name: "Light",
	isDark: false,
	shikiTheme: "github-light-default",
	colors: {
		// Surface
		"surface-base": "#ffffff",
		"surface-primary": "#f5f5f5", // neutral-100
		"surface-secondary": "#e5e5e5", // neutral-200
		"surface-tertiary": "#d4d4d4", // neutral-300
		"surface-overlay": "rgba(0, 0, 0, 0.3)",

		// Text
		"text-primary": "#171717", // neutral-900
		"text-secondary": "#404040", // neutral-700
		"text-tertiary": "#737373", // neutral-500
		"text-muted": "#a3a3a3", // neutral-400
		"text-on-accent": "#ffffff",

		// Border
		"border-primary": "#d4d4d4", // neutral-300
		"border-secondary": "#e5e5e5", // neutral-200
		"border-muted": "rgba(229, 229, 229, 0.5)", // neutral-200/50

		// Accent (blue)
		"accent-primary": "#2563eb", // blue-600
		"accent-primary-hover": "#1d4ed8", // blue-700
		"accent-soft": "rgba(59, 130, 246, 0.1)", // blue-500/10
		"accent-text": "#2563eb", // blue-600

		// Error
		"status-error": "#dc2626", // red-600
		"status-error-bg": "#fef2f2", // red-50
		"status-error-text": "#dc2626", // red-600
		"status-error-border": "rgba(220, 38, 38, 0.3)", // red-600/30

		// Success
		"status-success": "#16a34a", // green-600
		"status-success-bg": "#f0fdf4", // green-50
		"status-success-text": "#16a34a", // green-600
		"status-success-border": "rgba(22, 163, 74, 0.3)", // green-600/30

		// Warning
		"status-warning": "#d97706", // amber-600
		"status-warning-bg": "#fffbeb", // amber-50
		"status-warning-text": "#d97706", // amber-600

		// Info
		"status-info": "#2563eb", // blue-600
		"status-info-bg": "#eff6ff", // blue-50
		"status-info-text": "#2563eb", // blue-600

		// Thinking (indigo)
		"thinking-bg": "rgba(99, 102, 241, 0.08)", // indigo-500/8
		"thinking-border": "rgba(99, 102, 241, 0.2)", // indigo-500/20
		"thinking-text": "#4f46e5", // indigo-600

		// Code
		"code-bg": "#f5f5f5", // neutral-100
		"code-inline-bg": "#e5e5e5", // neutral-200

		// User bubble
		"user-bubble-bg": "#2563eb", // blue-600
		"user-bubble-text": "#ffffff",

		// Scrollbar
		"scrollbar-thumb": "#d4d4d4", // neutral-300
		"scrollbar-track": "transparent",
	},
};

// ============================================================================
// Dimmed — softer dark theme, easier on the eyes for long sessions
// ============================================================================

const dimmed: Theme = {
	id: "dimmed",
	name: "Dimmed",
	isDark: true,
	shikiTheme: "github-dark-dimmed",
	colors: {
		// Surface — warmer, slightly blue-gray tones
		"surface-base": "#1c2128", // GitHub dimmed base
		"surface-primary": "#22272e", // GitHub dimmed primary
		"surface-secondary": "#2d333b", // GitHub dimmed secondary
		"surface-tertiary": "#373e47",
		"surface-overlay": "rgba(28, 33, 40, 0.6)",

		// Text
		"text-primary": "#adbac7", // GitHub dimmed foreground
		"text-secondary": "#8b949e",
		"text-tertiary": "#768390",
		"text-muted": "#545d68",
		"text-on-accent": "#ffffff",

		// Border
		"border-primary": "#373e47",
		"border-secondary": "#2d333b",
		"border-muted": "rgba(45, 51, 59, 0.5)",

		// Accent (blue)
		"accent-primary": "#539bf5",
		"accent-primary-hover": "#4184e4",
		"accent-soft": "rgba(83, 155, 245, 0.1)",
		"accent-text": "#539bf5",

		// Error
		"status-error": "#e5534b",
		"status-error-bg": "rgba(229, 83, 75, 0.1)",
		"status-error-text": "#f47067",
		"status-error-border": "rgba(229, 83, 75, 0.3)",

		// Success
		"status-success": "#57ab5a",
		"status-success-bg": "rgba(87, 171, 90, 0.1)",
		"status-success-text": "#6bc46d",
		"status-success-border": "rgba(87, 171, 90, 0.3)",

		// Warning
		"status-warning": "#c69026",
		"status-warning-bg": "rgba(198, 144, 38, 0.1)",
		"status-warning-text": "#daaa3f",

		// Info
		"status-info": "#539bf5",
		"status-info-bg": "rgba(83, 155, 245, 0.1)",
		"status-info-text": "#6cb6ff",

		// Thinking (purple)
		"thinking-bg": "rgba(130, 80, 223, 0.1)",
		"thinking-border": "rgba(130, 80, 223, 0.25)",
		"thinking-text": "#b083f0",

		// Code
		"code-bg": "#1c2128",
		"code-inline-bg": "#2d333b",

		// User bubble
		"user-bubble-bg": "#316dca",
		"user-bubble-text": "#ffffff",

		// Scrollbar
		"scrollbar-thumb": "#373e47",
		"scrollbar-track": "transparent",
	},
};

// ============================================================================
// High Contrast Dark — maximum readability, strong borders, vivid colors
// ============================================================================

const highContrastDark: Theme = {
	id: "high-contrast-dark",
	name: "High Contrast Dark",
	isDark: true,
	shikiTheme: "github-dark-high-contrast",
	colors: {
		// Surface — pure black base, sharp separation
		"surface-base": "#010409",
		"surface-primary": "#0d1117",
		"surface-secondary": "#161b22",
		"surface-tertiary": "#21262d",
		"surface-overlay": "rgba(1, 4, 9, 0.7)",

		// Text — pure white primary, strong hierarchy
		"text-primary": "#f0f6fc",
		"text-secondary": "#e6edf3",
		"text-tertiary": "#b1bac4",
		"text-muted": "#6e7681",
		"text-on-accent": "#ffffff",

		// Border — visible, strong
		"border-primary": "#6e7681",
		"border-secondary": "#30363d",
		"border-muted": "rgba(48, 54, 61, 0.5)",

		// Accent (bright blue)
		"accent-primary": "#58a6ff",
		"accent-primary-hover": "#79c0ff",
		"accent-soft": "rgba(88, 166, 255, 0.15)",
		"accent-text": "#79c0ff",

		// Error (vivid red)
		"status-error": "#ff7b72",
		"status-error-bg": "rgba(255, 123, 114, 0.12)",
		"status-error-text": "#ffa198",
		"status-error-border": "rgba(255, 123, 114, 0.4)",

		// Success (vivid green)
		"status-success": "#3fb950",
		"status-success-bg": "rgba(63, 185, 80, 0.12)",
		"status-success-text": "#56d364",
		"status-success-border": "rgba(63, 185, 80, 0.4)",

		// Warning (vivid yellow)
		"status-warning": "#d29922",
		"status-warning-bg": "rgba(210, 153, 34, 0.12)",
		"status-warning-text": "#e3b341",

		// Info (vivid blue)
		"status-info": "#58a6ff",
		"status-info-bg": "rgba(88, 166, 255, 0.12)",
		"status-info-text": "#79c0ff",

		// Thinking (vivid purple)
		"thinking-bg": "rgba(188, 140, 255, 0.12)",
		"thinking-border": "rgba(188, 140, 255, 0.4)",
		"thinking-text": "#d2a8ff",

		// Code
		"code-bg": "#010409",
		"code-inline-bg": "#161b22",

		// User bubble
		"user-bubble-bg": "#1f6feb",
		"user-bubble-text": "#ffffff",

		// Scrollbar
		"scrollbar-thumb": "#6e7681",
		"scrollbar-track": "transparent",
	},
};

// ============================================================================
// High Contrast Light — maximum readability on white, strong borders
// ============================================================================

const highContrastLight: Theme = {
	id: "high-contrast-light",
	name: "High Contrast Light",
	isDark: false,
	shikiTheme: "github-light-high-contrast",
	colors: {
		// Surface — pure white base, strong contrast
		"surface-base": "#ffffff",
		"surface-primary": "#f6f8fa",
		"surface-secondary": "#eaeef2",
		"surface-tertiary": "#d0d7de",
		"surface-overlay": "rgba(0, 0, 0, 0.4)",

		// Text — pure black primary, strong hierarchy
		"text-primary": "#0e1116",
		"text-secondary": "#24292f",
		"text-tertiary": "#57606a",
		"text-muted": "#8c959f",
		"text-on-accent": "#ffffff",

		// Border — visible, strong
		"border-primary": "#57606a",
		"border-secondary": "#d0d7de",
		"border-muted": "rgba(208, 215, 222, 0.5)",

		// Accent (deep blue)
		"accent-primary": "#0550ae",
		"accent-primary-hover": "#033d8b",
		"accent-soft": "rgba(5, 80, 174, 0.08)",
		"accent-text": "#0550ae",

		// Error (vivid red)
		"status-error": "#cf222e",
		"status-error-bg": "#ffebe9",
		"status-error-text": "#a40e26",
		"status-error-border": "rgba(207, 34, 46, 0.4)",

		// Success (vivid green)
		"status-success": "#116329",
		"status-success-bg": "#dafbe1",
		"status-success-text": "#0a3622",
		"status-success-border": "rgba(17, 99, 41, 0.4)",

		// Warning (deep amber)
		"status-warning": "#9a6700",
		"status-warning-bg": "#fff8c5",
		"status-warning-text": "#7c5800",

		// Info (deep blue)
		"status-info": "#0550ae",
		"status-info-bg": "#ddf4ff",
		"status-info-text": "#033d8b",

		// Thinking (deep purple)
		"thinking-bg": "rgba(130, 80, 223, 0.08)",
		"thinking-border": "rgba(130, 80, 223, 0.3)",
		"thinking-text": "#6639ba",

		// Code
		"code-bg": "#f6f8fa",
		"code-inline-bg": "#eaeef2",

		// User bubble
		"user-bubble-bg": "#0550ae",
		"user-bubble-text": "#ffffff",

		// Scrollbar
		"scrollbar-thumb": "#afb8c1",
		"scrollbar-track": "transparent",
	},
};

// ============================================================================
// Registry
// ============================================================================

/**
 * All built-in themes, keyed by ID.
 * Order determines display order in the theme selector.
 */
export const BUILTIN_THEMES: ReadonlyMap<ThemeId, Theme> = new Map([
	["dark", dark],
	["light", light],
	["dimmed", dimmed],
	["high-contrast-dark", highContrastDark],
	["high-contrast-light", highContrastLight],
]);

/**
 * Ordered list of built-in themes for iteration (theme selector grid).
 */
export const THEME_LIST: readonly Theme[] = [...BUILTIN_THEMES.values()];

/**
 * The default theme ID.
 */
export const DEFAULT_THEME_ID: ThemeId = "dark";

/**
 * Look up a theme by ID. Returns the default theme if ID is unknown.
 */
export function getThemeById(id: string): Theme {
	return (BUILTIN_THEMES as ReadonlyMap<string, Theme>).get(id) ?? dark;
}

/**
 * Get the preferred theme based on system color scheme.
 * Returns "dark" or "light" depending on `prefers-color-scheme`.
 */
export function getSystemPreferredThemeId(): ThemeId {
	if (typeof window === "undefined") return DEFAULT_THEME_ID;
	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Apply a theme's color tokens as CSS custom properties on the document.
 * Also sets `data-theme` attribute for potential CSS selectors.
 */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.setAttribute("data-theme", theme.id);

	// Set each color token as a CSS custom property
	for (const [token, value] of Object.entries(theme.colors)) {
		root.style.setProperty(`--color-${token}`, value);
	}
}
