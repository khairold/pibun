import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTransport } from "./wireTransport";
import "./index.css";

// Initialize WebSocket transport and wire to Zustand store (before React renders)
initTransport();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
