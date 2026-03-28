import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell";
import { DEFAULT_THEME_ID, applyTheme, getSavedPreference, resolveTheme } from "./lib/themes";
import { initTransport } from "./wireTransport";
import "./index.css";

// Apply initial theme before React renders (prevents flash of unthemed content).
const preference = getSavedPreference() ?? DEFAULT_THEME_ID;
applyTheme(resolveTheme(preference));

// Initialize WebSocket transport and wire to Zustand store (before React renders)
initTransport();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<AppShell />
	</StrictMode>,
);
