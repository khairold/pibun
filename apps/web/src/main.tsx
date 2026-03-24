import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, getSavedPreference, resolveTheme } from "./lib/themes";
import { initTransport } from "./wireTransport";
import "./index.css";

// Apply initial theme before React renders (prevents flash of unthemed content).
// If no preference is saved, treat as "system" (follow OS dark/light mode).
const preference = getSavedPreference() ?? "system";
applyTheme(resolveTheme(preference));

// Initialize WebSocket transport and wire to Zustand store (before React renders)
initTransport();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
