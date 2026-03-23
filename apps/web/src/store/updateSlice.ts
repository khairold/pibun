/**
 * Update slice — auto-updater status from the desktop main process.
 *
 * Receives `app.update` push events via wireTransport and tracks:
 * - Current update status (checking, available, downloading, ready, etc.)
 * - New version info and download progress
 * - Error messages
 *
 * The UpdateBanner component reads this state to show update notifications.
 */

import type { StateCreator } from "zustand";
import type { AppStore, UpdateSlice } from "./types";

export const createUpdateSlice: StateCreator<AppStore, [], [], UpdateSlice> = (set) => ({
	updateStatus: null,
	updateMessage: "",
	updateVersion: null,
	updateProgress: null,
	updateError: null,

	setUpdateState: (status, message, version, progress, error) =>
		set({
			updateStatus: status,
			updateMessage: message,
			updateVersion: version ?? null,
			updateProgress: progress ?? null,
			updateError: error ?? null,
		}),

	dismissUpdate: () =>
		set({
			updateStatus: null,
			updateMessage: "",
			updateVersion: null,
			updateProgress: null,
			updateError: null,
		}),
});
