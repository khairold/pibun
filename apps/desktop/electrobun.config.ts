import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "PiBun",
		identifier: "dev.pibun.app",
		version: "0.1.0",
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// PiBun loads the web app from a localhost URL (server-rendered),
		// so we don't bundle any views. No copy or views config needed.
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
	runtime: {
		// We manage shutdown ourselves — window close triggers graceful
		// server + Pi process cleanup before exit. Electrobun's default
		// auto-quit would force-exit before async cleanup completes.
		exitOnLastWindowClosed: false,
	},
} satisfies ElectrobunConfig;
