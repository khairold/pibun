/**
 * Shiki highlighter singleton — lazy-loaded with on-demand language + theme loading.
 *
 * Uses `shiki/bundle/web` for a lighter bundle (web-focused languages only).
 * The highlighter instance is created once and reused. Languages and themes
 * are loaded on demand when first encountered.
 *
 * Theme switching: call `setShikiTheme()` when the app theme changes.
 * Components subscribe via `subscribeShikiTheme` + `getShikiTheme` (designed
 * for React's `useSyncExternalStore`).
 *
 * @module
 */

import type {
	BundledLanguage,
	BundledTheme,
	HighlighterGeneric,
	ThemedToken,
} from "shiki/bundle/web";

// ============================================================================
// Module state
// ============================================================================

/** The singleton highlighter instance. */
let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;

/** Set of languages that have been loaded or are currently loading. */
const loadedLanguages = new Set<string>();

/** Set of Shiki themes that have been loaded into the highlighter. */
const loadedThemes = new Set<string>();

/** Languages available in the web bundle — checked before attempting to load. */
let availableLanguages: Set<string> | null = null;

/** The current Shiki theme for code highlighting. Mutable via `setShikiTheme`. */
let currentTheme: BundledTheme = "github-dark-default";

/** Listeners notified when the Shiki theme changes (for React re-renders). */
const themeChangeListeners = new Set<() => void>();

// ============================================================================
// Highlighter singleton
// ============================================================================

/**
 * Get (or create) the singleton Shiki highlighter.
 * On first call, creates a highlighter with the current theme.
 * Languages and additional themes are loaded on demand.
 */
async function getHighlighter(): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> {
	if (!highlighterPromise) {
		highlighterPromise = import("shiki/bundle/web").then(
			async ({ bundledLanguages, createHighlighter }) => {
				// Cache the set of available language IDs for fast lookup
				availableLanguages = new Set(Object.keys(bundledLanguages));

				const hl = await createHighlighter({
					themes: [currentTheme],
					langs: [], // Load languages on demand
				});

				loadedThemes.add(currentTheme);
				return hl;
			},
		);
	}
	return highlighterPromise;
}

// ============================================================================
// Language resolution
// ============================================================================

/**
 * Check if a language identifier is supported by the web bundle.
 * Falls back to "text" for unsupported languages.
 */
function resolveLanguage(lang: string): string {
	if (!lang) return "text";
	const lower = lang.toLowerCase();
	if (!availableLanguages) return lower; // Not yet loaded, try anyway
	return availableLanguages.has(lower) ? lower : "text";
}

/**
 * Ensure a language is loaded and return the effective language ID.
 * Shared between `highlightCode` and `tokenizeCode`.
 */
async function ensureLanguage(lang: string): Promise<string> {
	const hl = await getHighlighter();
	const resolved = resolveLanguage(lang);

	if (resolved !== "text" && !loadedLanguages.has(resolved)) {
		loadedLanguages.add(resolved);
		try {
			await hl.loadLanguage(resolved as BundledLanguage);
		} catch {
			loadedLanguages.delete(resolved);
		}
	}

	return loadedLanguages.has(resolved) ? resolved : "text";
}

// ============================================================================
// Theme management
// ============================================================================

/**
 * Get the current Shiki theme name.
 *
 * Designed for use with React's `useSyncExternalStore` as the `getSnapshot`
 * function. Returns the current theme name (stable reference between changes).
 */
export function getShikiTheme(): BundledTheme {
	return currentTheme;
}

/**
 * Subscribe to Shiki theme changes.
 *
 * Designed for use with React's `useSyncExternalStore` as the `subscribe`
 * function. The callback is called (with no arguments) whenever the theme
 * changes via `setShikiTheme()`.
 *
 * @returns Unsubscribe function.
 */
export function subscribeShikiTheme(callback: () => void): () => void {
	themeChangeListeners.add(callback);
	return () => {
		themeChangeListeners.delete(callback);
	};
}

/**
 * Switch the Shiki code highlighting theme.
 *
 * Loads the new theme into the highlighter if not already loaded, then
 * notifies all subscribers (causing React components to re-highlight).
 *
 * Called from `applyTheme()` in `themes.ts` whenever the app theme changes.
 */
export async function setShikiTheme(theme: BundledTheme): Promise<void> {
	if (theme === currentTheme) return;

	// Load the theme into the highlighter if needed
	if (!loadedThemes.has(theme)) {
		try {
			const hl = await getHighlighter();
			await hl.loadTheme(theme);
			loadedThemes.add(theme);
		} catch (err) {
			console.warn(`[Shiki] Failed to load theme "${theme}":`, err);
			return; // Keep the old theme if loading fails
		}
	}

	// Update current theme and notify listeners
	currentTheme = theme;
	for (const listener of themeChangeListeners) {
		listener();
	}
}

// ============================================================================
// Public API — code highlighting
// ============================================================================

/**
 * Re-export ThemedToken so consumers don't need a direct shiki import.
 */
export type { ThemedToken };

/**
 * Tokenize code into structured tokens per line. Used by DiffViewer
 * for per-line rendering with syntax highlighting.
 *
 * @returns Array of lines, each containing an array of themed tokens.
 */
export async function tokenizeCode(code: string, lang: string): Promise<ThemedToken[][]> {
	const hl = await getHighlighter();
	const effectiveLang = await ensureLanguage(lang);

	const result = await hl.codeToTokens(code, {
		lang: effectiveLang as BundledLanguage,
		theme: currentTheme,
	});

	return result.tokens;
}

/**
 * Highlight code to HTML string. Used by CodeBlock for rendering.
 *
 * Uses the current Shiki theme (set via `setShikiTheme`).
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
	const hl = await getHighlighter();
	const effectiveLang = await ensureLanguage(lang);

	return hl.codeToHtml(code, {
		lang: effectiveLang as BundledLanguage,
		theme: currentTheme,
	});
}
