import type { ElectrobunConfig } from "electrobun";

// Auto-detect signing credentials from environment.
// When ELECTROBUN_DEVELOPER_ID is set, code signing is enabled.
// When notarization credentials are also set, notarization is enabled.
// Without these env vars, builds proceed unsigned (development builds).
const shouldCodesign = !!process.env.ELECTROBUN_DEVELOPER_ID;
const shouldNotarize =
	shouldCodesign && !!(process.env.ELECTROBUN_APPLEID || process.env.ELECTROBUN_APPLEAPIISSUER);

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
			codesign: shouldCodesign,
			notarize: shouldNotarize,
			// Entitlements for hardened runtime (required for notarization).
			// Electrobun provides defaults for JIT, unsigned memory, and library validation.
			// We add entitlements PiBun specifically needs.
			entitlements: {
				// Network: PiBun runs a local HTTP/WebSocket server and Pi makes API calls
				"com.apple.security.network.client": true,
				"com.apple.security.network.server": true,
				// File access: user selects project folders via file dialog
				"com.apple.security.files.user-selected.read-write": true,
			},
		},
		linux: {
			bundleCEF: false,
			// PNG icon for desktop entries, window icons, and taskbar.
			// Electrobun recommends at least 256x256; we use 1024x1024.
			icon: "assets/icon-1024.png",
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
