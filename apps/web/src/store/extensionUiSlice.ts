/**
 * Extension UI slice — manages pending extension dialog requests.
 *
 * Extension dialogs (select, confirm, input, editor) block Pi until
 * a response is sent. This slice holds the current pending request
 * so the UI can render the appropriate dialog.
 */

import type { StateCreator } from "zustand";
import type { AppStore, ExtensionUiSlice } from "./types";

export const createExtensionUiSlice: StateCreator<AppStore, [], [], ExtensionUiSlice> = (set) => ({
	pendingExtensionUi: null,

	setPendingExtensionUi: (request) => set({ pendingExtensionUi: request }),
	clearPendingExtensionUi: () => set({ pendingExtensionUi: null }),
});
