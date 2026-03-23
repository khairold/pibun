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
		// Copy the built web app into the app bundle for static file serving.
		// Source paths are relative to this config file's directory (apps/desktop/).
		// Destination paths are relative to Resources/app/ in the bundle.
		copy: {
			"../web/dist": "web-dist",
		},
		mac: {
			bundleCEF: false,
			icons: "icon.iconset",
			// DMG creation is enabled by default (createDmg: true).
			// Code signing and notarization handled in Phase 2C.2.
			codesign: false,
			notarize: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
			icon: "assets/icon-1024.png",
		},
	},
	// Build the web app before packaging. Script runs via Bun from apps/desktop/.
	scripts: {
		preBuild: "scripts/prebuild.ts",
	},
	runtime: {
		// We manage shutdown ourselves — window close triggers graceful
		// server + Pi process cleanup before exit. Electrobun's default
		// auto-quit would force-exit before async cleanup completes.
		exitOnLastWindowClosed: false,
	},
} satisfies ElectrobunConfig;
