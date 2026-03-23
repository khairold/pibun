/**
 * Shiki highlighter singleton — lazy-loaded with on-demand language loading.
 *
 * Uses `shiki/bundle/web` for a lighter bundle (web-focused languages only).
 * The highlighter instance is created once and reused. Languages are loaded
 * on demand when first encountered.
 *
 * @module
 */

import type {
	BundledLanguage,
	BundledTheme,
	HighlighterGeneric,
	ThemedToken,
} from "shiki/bundle/web";

/** The singleton highlighter instance. */
let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;

/** Set of languages that have been loaded or are currently loading. */
const loadedLanguages = new Set<string>();

/** Languages available in the web bundle — checked before attempting to load. */
let availableLanguages: Set<string> | null = null;

/** The theme we use for code highlighting. */
const THEME: BundledTheme = "github-dark-default";

/**
 * Get (or create) the singleton Shiki highlighter.
 * On first call, creates a highlighter with the base theme.
 * Languages are loaded on demand via `highlightCode`.
 */
async function getHighlighter(): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> {
	if (!highlighterPromise) {
		highlighterPromise = import("shiki/bundle/web").then(
			async ({ bundledLanguages, createHighlighter }) => {
				// Cache the set of available language IDs for fast lookup
				availableLanguages = new Set(Object.keys(bundledLanguages));

				const hl = await createHighlighter({
					themes: [THEME],
					langs: [], // Load languages on demand
				});
				return hl;
			},
		);
	}
	return highlighterPromise;
}

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
 * Re-export ThemedToken so consumers don't need a direct shiki import.
 */
export type { ThemedToken };

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
		theme: THEME,
	});

	return result.tokens;
}

export async function highlightCode(code: string, lang: string): Promise<string> {
	const hl = await getHighlighter();
	const effectiveLang = await ensureLanguage(lang);

	return hl.codeToHtml(code, {
		lang: effectiveLang as BundledLanguage,
		theme: THEME,
	});
}
