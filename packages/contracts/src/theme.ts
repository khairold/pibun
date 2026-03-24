/**
 * Theme types — semantic color tokens for PiBun's UI theming system.
 *
 * Colors are organized by semantic role (surface, text, border, accent, status)
 * rather than raw hue values. Components reference these tokens via CSS custom
 * properties (e.g., `var(--color-surface-primary)`), allowing themes to remap
 * the entire UI by changing token values.
 *
 * @module
 */

/**
 * Semantic color token names for the UI.
 *
 * Each token maps to a CSS custom property: `--color-{token-name}`.
 * Values are CSS color strings (hex, rgb, hsl, oklch, etc.).
 */
export interface ThemeColors {
	// ── Surface (backgrounds) ──────────────────────────────────────────
	/** App-level background (deepest layer). */
	"surface-base": string;
	/** Primary panel/card background. */
	"surface-primary": string;
	/** Elevated card/section background. */
	"surface-secondary": string;
	/** Hover/pressed states on surfaces. */
	"surface-tertiary": string;
	/** Modal/overlay backdrop tint. */
	"surface-overlay": string;

	// ── Text ───────────────────────────────────────────────────────────
	/** Primary body text. */
	"text-primary": string;
	/** Secondary text (descriptions, labels). */
	"text-secondary": string;
	/** Tertiary text (placeholders, hints). */
	"text-tertiary": string;
	/** Muted text (timestamps, disabled items). */
	"text-muted": string;
	/** Text on colored/accent backgrounds. */
	"text-on-accent": string;

	// ── Border ─────────────────────────────────────────────────────────
	/** Primary borders (panels, cards). */
	"border-primary": string;
	/** Secondary/subtle borders (dividers, separators). */
	"border-secondary": string;
	/** Muted borders (very subtle divisions). */
	"border-muted": string;

	// ── Accent ─────────────────────────────────────────────────────────
	/** Primary accent color (buttons, links, active indicators). */
	"accent-primary": string;
	/** Hovered accent. */
	"accent-primary-hover": string;
	/** Soft accent background tint. */
	"accent-soft": string;
	/** Accent-colored text (links, active labels). */
	"accent-text": string;

	// ── Status: Error ──────────────────────────────────────────────────
	/** Error indicator color. */
	"status-error": string;
	/** Error background tint. */
	"status-error-bg": string;
	/** Error text. */
	"status-error-text": string;
	/** Error border. */
	"status-error-border": string;

	// ── Status: Success ────────────────────────────────────────────────
	/** Success indicator color. */
	"status-success": string;
	/** Success background tint. */
	"status-success-bg": string;
	/** Success text. */
	"status-success-text": string;
	/** Success border. */
	"status-success-border": string;

	// ── Status: Warning ────────────────────────────────────────────────
	/** Warning indicator color. */
	"status-warning": string;
	/** Warning background tint. */
	"status-warning-bg": string;
	/** Warning text. */
	"status-warning-text": string;

	// ── Status: Info ───────────────────────────────────────────────────
	/** Info indicator color. */
	"status-info": string;
	/** Info background tint. */
	"status-info-bg": string;
	/** Info text. */
	"status-info-text": string;

	// ── Thinking (assistant reasoning) ─────────────────────────────────
	/** Thinking section background tint. */
	"thinking-bg": string;
	/** Thinking section border. */
	"thinking-border": string;
	/** Thinking section text. */
	"thinking-text": string;

	// ── Code ───────────────────────────────────────────────────────────
	/** Code block background. */
	"code-bg": string;
	/** Inline code background. */
	"code-inline-bg": string;

	// ── User message bubble ────────────────────────────────────────────
	/** User message background. */
	"user-bubble-bg": string;
	/** User message text. */
	"user-bubble-text": string;

	// ── Scrollbar ──────────────────────────────────────────────────────
	/** Scrollbar thumb color. */
	"scrollbar-thumb": string;
	/** Scrollbar track color. */
	"scrollbar-track": string;
}

/**
 * A complete UI theme definition.
 *
 * Theme colors are CSS custom property values. The theme is applied by setting
 * `data-theme="{id}"` on `<html>` and injecting CSS custom properties.
 */
export interface Theme {
	/** Unique identifier (kebab-case, e.g. "dark", "high-contrast-dark"). */
	id: string;
	/** Display name shown in the theme selector UI. */
	name: string;
	/** Whether this is a dark theme. Affects system preference matching. */
	isDark: boolean;
	/** Semantic color values keyed by token name. */
	colors: ThemeColors;
	/** Shiki theme name to use for code highlighting in this theme. */
	shikiTheme: string;
}

/**
 * Available built-in theme IDs.
 * Used for type-safe theme references and persistence.
 */
export type ThemeId = "light" | "dark" | "dimmed" | "high-contrast-dark" | "high-contrast-light";
