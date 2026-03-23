/**
 * Notifications slice — toasts and persistent status indicators.
 *
 * Toasts are triggered by extension `notify` events and auto-dismiss.
 * Statuses are persistent indicators set by extension `setStatus` events,
 * keyed by `statusKey` — setting `statusText` to empty/undefined removes it.
 */

import type { StateCreator } from "zustand";
import type { AppStore, NotificationsSlice, Toast } from "./types";

/** Auto-incrementing counter for toast IDs. */
let toastIdCounter = 0;

/** Auto-dismiss timeout in milliseconds. */
const TOAST_DISMISS_MS = 5_000;

export const createNotificationsSlice: StateCreator<AppStore, [], [], NotificationsSlice> = (
	set,
	get,
) => ({
	toasts: [],
	statuses: new Map(),

	addToast: (message, level) => {
		const id = `toast-${String(++toastIdCounter)}`;
		const toast: Toast = { id, message, level, createdAt: Date.now() };
		set({ toasts: [...get().toasts, toast] });

		// Auto-dismiss after timeout
		setTimeout(() => {
			const current = get().toasts;
			set({ toasts: current.filter((t) => t.id !== id) });
		}, TOAST_DISMISS_MS);

		return id;
	},

	removeToast: (id) => {
		set({ toasts: get().toasts.filter((t) => t.id !== id) });
	},

	setExtensionStatus: (key, text) => {
		const next = new Map(get().statuses);
		if (text) {
			next.set(key, text);
		} else {
			next.delete(key);
		}
		set({ statuses: next });
	},

	clearStatuses: () => {
		set({ statuses: new Map() });
	},
});
