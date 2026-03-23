#!/usr/bin/env bun
/**
 * Build script for Linux distribution builds.
 *
 * Produces a self-extracting installer archive (.tar.gz) that the user can
 * download, extract, and run. The installer:
 * - Extracts the application to ~/.local/share/<identifier>/
 * - Creates a .desktop entry with the app's icon
 * - Supports the Electrobun auto-update mechanism
 *
 * Electrobun does NOT produce AppImages — it uses its own self-extracting
 * installer format to avoid the libfuse2 dependency.
 *
 * Prerequisites:
 * - Must be run ON a Linux system (no cross-compilation)
 * - WebKitGTK development headers (for native webview)
 *   - Ubuntu/Debian: apt install libwebkit2gtk-4.1-dev
 *   - Fedora: dnf install webkit2gtk4.1-devel
 *   - Arch: pacman -S webkit2gtk-4.1
 *
 * Usage:
 *   bun scripts/build-linux.ts                 # stable build
 *   bun scripts/build-linux.ts --env=canary    # canary build
 *   bun scripts/build-linux.ts --env=dev       # dev build (no installer archive)
 *
 * Output artifacts (in apps/desktop/artifacts/):
 *   stable-linux-<arch>-PiBun-Setup.tar.gz  — Self-extracting installer archive
 *   PiBun.tar.zst                           — Compressed app bundle
 *   update.json                             — Auto-update metadata
 *
 * See docs/DESKTOP.md for full distribution documentation.
 */

const args = process.argv.slice(2);
const envFlag = args.find((a) => a.startsWith("--env=")) ?? "--env=stable";

// ── Platform check ──────────────────────────────────────────────────────

if (process.platform !== "linux") {
	console.error("❌ Linux builds must be run on a Linux system.");
	console.error("");
	console.error("   Electrobun does not support cross-compilation.");
	console.error("   Use a Linux machine, VM, or CI runner.");
	console.error("");
	console.error("   For CI, see the GitHub Actions workflow at:");
	console.error("   .github/workflows/release.yml (planned)");
	process.exit(1);
}

// ── Check for WebKitGTK ─────────────────────────────────────────────────

try {
	const pkgConfig = Bun.spawnSync(
		["pkg-config", "--exists", "webkit2gtk-4.1"],
		{ stdio: ["ignore", "ignore", "ignore"] },
	);

	if (pkgConfig.exitCode !== 0) {
		console.warn("⚠️  webkit2gtk-4.1 not found via pkg-config.");
		console.warn("   The build may fail if WebKitGTK dev headers are missing.");
		console.warn("");
		console.warn("   Install with:");
		console.warn("     Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-dev");
		console.warn("     Fedora:        sudo dnf install webkit2gtk4.1-devel");
		console.warn("     Arch:          sudo pacman -S webkit2gtk-4.1");
		console.warn("");
	} else {
		console.log("✅ WebKitGTK development headers found");
	}
} catch {
	// pkg-config not available — skip the check
	console.warn("⚠️  pkg-config not found — skipping WebKitGTK check");
}

// ── Run the Electrobun build ────────────────────────────────────────────

console.log("");
console.log(`🐧 Building PiBun for Linux (${envFlag})...`);
console.log(`   Architecture: ${process.arch}`);
console.log("");

const result = Bun.spawnSync(["npx", "electrobun", "build", envFlag], {
	cwd: import.meta.dir.replace(/\/scripts$/, ""),
	stdio: ["inherit", "inherit", "inherit"],
	env: process.env,
});

if (result.exitCode !== 0) {
	console.error("");
	console.error(`❌ Build failed with exit code ${result.exitCode}`);
	process.exit(result.exitCode ?? 1);
}

console.log("");
console.log("✅ Linux build complete!");
console.log("");
console.log("Artifacts are in apps/desktop/artifacts/");
console.log("");
console.log("To distribute:");
console.log("  1. Upload the *-Setup.tar.gz to GitHub Releases");
console.log("  2. Users download, extract, and run the installer");
console.log("  3. The installer copies the app to ~/.local/share/ and creates a desktop entry");
