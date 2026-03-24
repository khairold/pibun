/**
 * App slice — app-level state orthogonal to chat sessions.
 *
 * Combines:
 * - Connection state (WebSocket transport lifecycle)
 * - UI state (sidebar, composer text injection)
 * - Update state (auto-updater from desktop main process)
 * - Notifications state (toasts + persistent status indicators)
 *
 * These are grouped because they're always orthogonal to the
 * conversation flow — they don't co-change with session/message state.
 */

import type { StateCreator } from "zustand";
import type {
	AppStore,
	ConnectionSlice,
	NotificationsSlice,
	Toast,
	UiSlice,
	UpdateSlice,
} from "./types";

// ==== Combined Slice Type ====

type AppSlice = ConnectionSlice & UiSlice & UpdateSlice & NotificationsSlice;

// ==== UI Helpers ====

/** Tailwind `md` breakpoint in pixels. */
const MD_BREAKPOINT = 768;

/** Check if the viewport is desktop-width (≥ md breakpoint). */
function isDesktopWidth(): boolean {
	return typeof window !== "undefined" && window.innerWidth >= MD_BREAKPOINT;
}

// ==== Notifications Helpers ====

/** Auto-incrementing counter for toast IDs. */
let toastIdCounter = 0;

/** Auto-dismiss timeout in milliseconds. */
const TOAST_DISMISS_MS = 5_000;

// ==== Slice Creator ====

export const createAppSlice: StateCreator<AppStore, [], [], AppSlice> = (set, get) => ({
	// ---- Connection state ----
	connectionStatus: "connecting",
	reconnectAttempt: 0,
	lastError: null,
	providerHealth: null,

	setConnectionStatus: (status) => set({ connectionStatus: status }),
	setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
	setLastError: (error) => set({ lastError: error }),
	clearLastError: () => set({ lastError: null }),
	setProviderHealth: (issue) => set({ providerHealth: issue }),

	// ---- UI state ----
	sidebarOpen: isDesktopWidth(),
	settingsOpen: false,
	pendingComposerText: null,
	imagePreviewUrl: null,
	imagePreviewAlt: "",
	timestampFormat: "locale",
	pendingTerminalContexts: [],

	toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
	setSidebarOpen: (open) => set({ sidebarOpen: open }),
	setSettingsOpen: (open) => set({ settingsOpen: open }),
	setPendingComposerText: (text) => set({ pendingComposerText: text }),
	setImagePreview: (url, alt) => set({ imagePreviewUrl: url, imagePreviewAlt: alt ?? "" }),
	setTimestampFormat: (format) => set({ timestampFormat: format }),
	addTerminalContext: (context) =>
		set((state) => {
			// Deduplicate by terminal + line range
			const dedupKey = `${context.terminalId}\0${String(context.lineStart)}\0${String(context.lineEnd)}`;
			const exists = state.pendingTerminalContexts.some(
				(c) => `${c.terminalId}\0${String(c.lineStart)}\0${String(c.lineEnd)}` === dedupKey,
			);
			if (exists) return state;
			return {
				pendingTerminalContexts: [...state.pendingTerminalContexts, context],
			};
		}),
	removeTerminalContext: (id) =>
		set((state) => ({
			pendingTerminalContexts: state.pendingTerminalContexts.filter((c) => c.id !== id),
		})),
	clearTerminalContexts: () => set({ pendingTerminalContexts: [] }),

	// ---- Diff panel state ----
	diffPanelOpen: false,
	diffPanelFiles: [],
	diffPanelLoading: false,
	diffPanelResult: null,
	diffPanelError: null,
	diffPanelMode: "stacked",
	diffPanelSelectedFile: null,

	toggleDiffPanel: () => set((state) => ({ diffPanelOpen: !state.diffPanelOpen })),
	setDiffPanelOpen: (open) => set({ diffPanelOpen: open }),
	openDiffPanel: (files) =>
		set({
			diffPanelOpen: true,
			diffPanelFiles: files,
			diffPanelResult: null,
			diffPanelError: null,
			diffPanelSelectedFile: null,
		}),
	setDiffPanelLoading: (loading) => set({ diffPanelLoading: loading }),
	setDiffPanelResult: (result) => set({ diffPanelResult: result }),
	setDiffPanelError: (error) => set({ diffPanelError: error }),
	setDiffPanelMode: (mode) => set({ diffPanelMode: mode }),
	setDiffPanelSelectedFile: (path) => set({ diffPanelSelectedFile: path }),

	// ---- Update state ----
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

	// ---- Notifications state ----
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
