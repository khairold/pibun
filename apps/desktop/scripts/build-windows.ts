#!/usr/bin/env bun
/**
 * Build script for Windows distribution builds.
 *
 * Produces a self-extracting installer exe wrapped in a zip for distribution.
 * Electrobun uses its own installer format (not NSIS or MSI):
 * - A self-extracting exe that installs to %LOCALAPPDATA%\<identifier>\
 * - Icon embedded via rcedit for user-friendly display
 * - Metadata JSON for the auto-update mechanism
 * - The exe + archive + metadata are wrapped in a .zip for download
 *
 * Prerequisites:
 * - Must be run ON a Windows system (no cross-compilation)
 * - WebView2 runtime (pre-installed on Windows 10 21H2+ and Windows 11)
 *
 * Usage:
 *   bun scripts/build-windows.ts                 # stable build
 *   bun scripts/build-windows.ts --env=canary    # canary build
 *   bun scripts/build-windows.ts --env=dev       # dev build (no installer zip)
 *
 * Output artifacts (in apps/desktop/artifacts/):
 *   PiBun-Setup.exe               — Self-extracting installer
 *   PiBun-Setup.metadata.json     — Auto-update metadata
 *   PiBun-Setup.tar.zst           — Compressed app bundle
 *   PiBun-Setup.zip               — Distribution zip (exe + metadata + archive)
 *
 * See docs/DESKTOP.md for full distribution documentation.
 */

const args = process.argv.slice(2);
const envFlag = args.find((a) => a.startsWith("--env=")) ?? "--env=stable";

// ── Platform check ──────────────────────────────────────────────────────

if (process.platform !== "win32") {
	console.error("❌ Windows builds must be run on a Windows system.");
	console.error("");
	console.error("   Electrobun does not support cross-compilation.");
	console.error("   Use a Windows machine, VM, or CI runner.");
	console.error("");
	console.error("   For CI, see the GitHub Actions workflow at:");
	console.error("   .github/workflows/release.yml (planned)");
	process.exit(1);
}

// ── Check for WebView2 ──────────────────────────────────────────────────

// WebView2 is pre-installed on Windows 10 21H2+ and Windows 11.
// For older systems, users may need to install the WebView2 Runtime.
// We just log a note — no hard check since the build itself doesn't need it.
console.log("ℹ️  WebView2 runtime required at install time");
console.log("   Pre-installed on Windows 10 21H2+ and Windows 11");
console.log("   Download: https://developer.microsoft.com/en-us/microsoft-edge/webview2/");
console.log("");

// ── Run the Electrobun build ────────────────────────────────────────────

console.log(`🪟  Building PiBun for Windows (${envFlag})...`);
console.log(`   Architecture: ${process.arch}`);
console.log("");

const result = Bun.spawnSync(["npx", "electrobun", "build", envFlag], {
	cwd: import.meta.dir.replace(/[\\/]scripts$/, ""),
	stdio: ["inherit", "inherit", "inherit"],
	env: process.env,
});

if (result.exitCode !== 0) {
	console.error("");
	console.error(`❌ Build failed with exit code ${result.exitCode}`);
	process.exit(result.exitCode ?? 1);
}

console.log("");
console.log("✅ Windows build complete!");
console.log("");
console.log("Artifacts are in apps/desktop/artifacts/");
console.log("");
console.log("To distribute:");
console.log("  1. Upload the PiBun-Setup.zip to GitHub Releases");
console.log("  2. Users download, extract the zip, and run PiBun-Setup.exe");
console.log("  3. The installer extracts the app to %LOCALAPPDATA%\\dev.pibun.app\\");
console.log("");
console.log("WebView2 requirement:");
console.log("  - Pre-installed on Windows 10 21H2+ and Windows 11");
console.log("  - Older systems: https://developer.microsoft.com/en-us/microsoft-edge/webview2/");
