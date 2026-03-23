/**
 * UI slice — layout toggles and transient UI state.
 *
 * Controls sidebar visibility. Defaults to open on desktop-width
 * viewports, closed on narrow viewports. The threshold matches
 * Tailwind's `md` breakpoint (768px).
 */

import type { StateCreator } from "zustand";
import type { AppStore, UiSlice } from "./types";

/** Tailwind `md` breakpoint in pixels. */
const MD_BREAKPOINT = 768;

/** Check if the viewport is desktop-width (≥ md breakpoint). */
function isDesktopWidth(): boolean {
	return typeof window !== "undefined" && window.innerWidth >= MD_BREAKPOINT;
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
	sidebarOpen: isDesktopWidth(),

	toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
	setSidebarOpen: (open) => set({ sidebarOpen: open }),
});
