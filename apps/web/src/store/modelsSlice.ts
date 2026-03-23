/**
 * Models slice — available model list fetched from Pi via session.getModels.
 *
 * Stores the full PiModel[] from `get_available_models`.
 * Components group by provider for display. Loading state tracks
 * in-flight fetch to avoid duplicate requests.
 */

import type { StateCreator } from "zustand";
import type { AppStore, ModelsSlice } from "./types";

export const createModelsSlice: StateCreator<AppStore, [], [], ModelsSlice> = (set) => ({
	availableModels: [],
	modelsLoading: false,

	setAvailableModels: (models) => set({ availableModels: models }),
	setModelsLoading: (loading) => set({ modelsLoading: loading }),
});
