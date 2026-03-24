/**
 * useShikiTheme — React hook for the current Shiki code highlighting theme.
 *
 * Subscribes to theme changes via `useSyncExternalStore`. When the app theme
 * changes and `setShikiTheme()` is called, this hook re-renders components
 * that depend on the Shiki theme (e.g., CodeBlock, DiffViewer).
 *
 * @module
 */

import { getShikiTheme, subscribeShikiTheme } from "@/lib/highlighter";
import { useSyncExternalStore } from "react";

/**
 * Returns the current Shiki theme name and re-renders when it changes.
 *
 * Use this as a dependency in `useEffect` to trigger re-highlighting
 * when the user switches app themes.
 */
export function useShikiTheme(): string {
	return useSyncExternalStore(subscribeShikiTheme, getShikiTheme);
}
