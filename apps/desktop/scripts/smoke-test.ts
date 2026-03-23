#!/usr/bin/env bun
/**
 * Desktop Artifact Smoke Test
 *
 * Validates that build artifacts for the current platform are correctly formed.
 * Platform-aware: detects the OS and checks the appropriate artifact format.
 *
 * macOS checks:
 *   - DMG file exists with correct naming pattern
 *   - DMG has reasonable file size (>5MB)
 *   - tar.zst archive exists
 *   - update.json metadata exists and is valid JSON
 *
 * Linux checks:
 *   - tar.gz installer archive exists
 *   - Has reasonable file size (>5MB)
 *   - update.json metadata exists and is valid JSON
 *
 * Windows checks:
 *   - Setup zip exists
 *   - Has reasonable file size (>5MB)
 *   - update.json metadata exists and is valid JSON
 *
 * Usage:
 *   bun scripts/smoke-test.ts                       # test current platform artifacts
 *   bun scripts/smoke-test.ts --artifacts-dir=path   # custom artifacts directory
 *   bun scripts/smoke-test.ts --platform=macos       # override platform detection
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================================
// Config
// ============================================================================

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
	const flag = args.find((a) => a.startsWith(`--${name}=`));
	return flag ? flag.split("=")[1] : undefined;
}

const DESKTOP_DIR = resolve(import.meta.dir, "..");
const ARTIFACTS_DIR = getArg("artifacts-dir")
	? resolve(getArg("artifacts-dir") as string)
	: resolve(DESKTOP_DIR, "artifacts");

function detectPlatform(): string {
	const override = getArg("platform");
	if (override) return override;

	switch (process.platform) {
		case "darwin":
			return "macos";
		case "linux":
			return "linux";
		case "win32":
			return "windows";
		default:
			return process.platform;
	}
}

const PLATFORM = detectPlatform();

/** Minimum expected artifact size in bytes (5 MB). */
const MIN_SIZE_BYTES = 5 * 1024 * 1024;

// ============================================================================
// Helpers
// ============================================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label: string, condition: boolean, detail?: string): void {
	if (condition) {
		passed++;
		console.log(`  ✅ ${label}`);
	} else {
		failed++;
		console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

function skip(label: string, reason: string): void {
	skipped++;
	console.log(`  ⏭️  ${label} — ${reason}`);
}

function findFile(dir: string, pattern: RegExp): string | null {
	if (!existsSync(dir)) return null;
	const files = readdirSync(dir);
	const match = files.find((f) => pattern.test(f));
	return match ? resolve(dir, match) : null;
}

function fileSize(path: string): number {
	return statSync(path).size;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ============================================================================
// Platform-Specific Checks
// ============================================================================

function testArtifactsDirectory(): void {
	console.log("\n── Artifacts Directory ──");

	check("Artifacts directory exists", existsSync(ARTIFACTS_DIR), ARTIFACTS_DIR);

	if (existsSync(ARTIFACTS_DIR)) {
		const files = readdirSync(ARTIFACTS_DIR);
		console.log(`  📁 Contents: ${files.join(", ") || "(empty)"}`);
		check("Artifacts directory is not empty", files.length > 0);
	}
}

function testMacOS(): void {
	console.log("\n── macOS Artifact Checks ──");

	// DMG file
	const dmg = findFile(ARTIFACTS_DIR, /\.dmg$/);
	if (dmg) {
		check("DMG file exists", true);
		const size = fileSize(dmg);
		check(
			`DMG has reasonable size (${formatSize(size)})`,
			size > MIN_SIZE_BYTES,
			`expected >${formatSize(MIN_SIZE_BYTES)}, got ${formatSize(size)}`,
		);
		check(
			"DMG follows naming convention",
			/^(stable|canary)-macos-arm64-PiBun\.dmg$/.test(dmg.split("/").pop() ?? ""),
		);
	} else {
		check("DMG file exists", false, "no *.dmg found in artifacts/");
	}

	// tar.zst archive
	const tarZst = findFile(ARTIFACTS_DIR, /\.tar\.zst$/);
	if (tarZst) {
		check("tar.zst archive exists", true);
		const size = fileSize(tarZst);
		check(
			`tar.zst has reasonable size (${formatSize(size)})`,
			size > MIN_SIZE_BYTES,
			`expected >${formatSize(MIN_SIZE_BYTES)}, got ${formatSize(size)}`,
		);
	} else {
		check("tar.zst archive exists", false, "no *.tar.zst found");
	}

	// update.json
	testUpdateJson();
}

function testLinux(): void {
	console.log("\n── Linux Artifact Checks ──");

	// Self-extracting installer archive
	const tarGz = findFile(ARTIFACTS_DIR, /Setup\.tar\.gz$/);
	if (tarGz) {
		check("Setup tar.gz exists", true);
		const size = fileSize(tarGz);
		check(
			`Setup tar.gz has reasonable size (${formatSize(size)})`,
			size > MIN_SIZE_BYTES,
			`expected >${formatSize(MIN_SIZE_BYTES)}, got ${formatSize(size)}`,
		);
		check(
			"Setup follows naming convention",
			/PiBun-Setup\.tar\.gz$/.test(tarGz.split("/").pop() ?? ""),
		);
	} else {
		check("Setup tar.gz exists", false, "no *Setup.tar.gz found in artifacts/");
	}

	// tar.zst archive
	const tarZst = findFile(ARTIFACTS_DIR, /\.tar\.zst$/);
	if (tarZst) {
		check("tar.zst archive exists", true);
	} else {
		skip("tar.zst archive", "not always present for Linux");
	}

	// update.json
	testUpdateJson();
}

function testWindows(): void {
	console.log("\n── Windows Artifact Checks ──");

	// Setup zip
	const zip = findFile(ARTIFACTS_DIR, /Setup\.zip$/);
	if (zip) {
		check("Setup zip exists", true);
		const size = fileSize(zip);
		check(
			`Setup zip has reasonable size (${formatSize(size)})`,
			size > MIN_SIZE_BYTES,
			`expected >${formatSize(MIN_SIZE_BYTES)}, got ${formatSize(size)}`,
		);
		check(
			"Setup follows naming convention",
			/PiBun-Setup\.zip$/.test(zip.split("/").pop() ?? ""),
		);
	} else {
		check("Setup zip exists", false, "no *Setup.zip found in artifacts/");
	}

	// update.json
	testUpdateJson();
}

function testUpdateJson(): void {
	const updateJson = findFile(ARTIFACTS_DIR, /update\.json$/);
	if (updateJson) {
		check("update.json exists", true);

		try {
			const content = require("node:fs").readFileSync(updateJson, "utf-8");
			const data = JSON.parse(content) as Record<string, unknown>;
			check("update.json is valid JSON", true);
			check(
				"update.json has version field",
				typeof data.version === "string" && data.version.length > 0,
			);
		} catch (e) {
			check("update.json is valid JSON", false, String(e));
		}
	} else {
		check("update.json exists", false, "no *update.json found");
	}
}

// ============================================================================
// Cross-Platform Checks
// ============================================================================

function testWebDist(): void {
	console.log("\n── Web App Distribution ──");

	const webDistDir = resolve(DESKTOP_DIR, "../web/dist");

	if (!existsSync(webDistDir)) {
		skip("Web dist directory", "not built (run `bun run build:web` first)");
		return;
	}

	check("Web dist directory exists", true);
	check(
		"index.html exists in web dist",
		existsSync(resolve(webDistDir, "index.html")),
	);

	// Check for JS bundle
	const assetsDir = resolve(webDistDir, "assets");
	if (existsSync(assetsDir)) {
		const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
		check("JS bundle exists in assets/", jsFiles.length > 0);

		const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".css"));
		check("CSS bundle exists in assets/", cssFiles.length > 0);
	} else {
		check("assets/ directory exists", false);
	}
}

function testElectrobunConfig(): void {
	console.log("\n── Electrobun Config ──");

	const configPath = resolve(DESKTOP_DIR, "electrobun.config.ts");
	check("electrobun.config.ts exists", existsSync(configPath));

	// Check icon assets
	const iconsetPath = resolve(DESKTOP_DIR, "icon.iconset");
	const masterIconPath = resolve(DESKTOP_DIR, "assets/icon-1024.png");

	check("icon.iconset directory exists", existsSync(iconsetPath));
	check("Master icon PNG exists", existsSync(masterIconPath));

	if (existsSync(masterIconPath)) {
		const size = fileSize(masterIconPath);
		check(
			`Master icon has reasonable size (${formatSize(size)})`,
			size > 1024,
			"expected >1KB",
		);
	}
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
	console.log("🔥 PiBun Desktop Artifact Smoke Test");
	console.log("═════════════════════════════════════");
	console.log(`   Platform:   ${PLATFORM}`);
	console.log(`   Artifacts:  ${ARTIFACTS_DIR}`);
	console.log(`   Desktop:    ${DESKTOP_DIR}`);

	// Cross-platform checks always run
	testElectrobunConfig();
	testWebDist();

	// Platform-specific artifact checks
	if (!existsSync(ARTIFACTS_DIR)) {
		console.log("\n⚠️  No artifacts directory — skipping platform-specific checks.");
		console.log("   Build first: bun run build:desktop");
	} else {
		testArtifactsDirectory();

		switch (PLATFORM) {
			case "macos":
				testMacOS();
				break;
			case "linux":
				testLinux();
				break;
			case "windows":
				testWindows();
				break;
			default:
				console.log(`\n⚠️  Unknown platform: ${PLATFORM} — skipping platform-specific checks`);
				break;
		}
	}

	// Summary
	console.log("\n═════════════════════════════════════");
	console.log(
		`Results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${passed + failed + skipped} total`,
	);

	if (failed > 0) {
		console.log("\n❌ SMOKE TEST FAILED");
		process.exit(1);
	}

	console.log("\n✅ ALL SMOKE TESTS PASSED");
}

main();
