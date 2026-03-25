import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 24269,
		proxy: {
			"/ws": {
				target: "ws://localhost:24242",
				ws: true,
			},
			"/api": {
				target: "http://localhost:24242",
			},
			"/plugin": {
				target: "http://localhost:24242",
			},
		},
	},
	build: {
		outDir: "dist",
	},
});
