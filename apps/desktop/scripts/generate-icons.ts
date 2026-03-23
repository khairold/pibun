#!/usr/bin/env bun
/**
 * Generate macOS .iconset PNGs from a master 1024x1024 PNG.
 *
 * Usage:
 *   bun run apps/desktop/scripts/generate-icons.ts
 *
 * Requires macOS `sips` and `iconutil` command-line tools.
 * The master PNG must be at apps/desktop/assets/icon-1024.png (1024x1024).
 *
 * Outputs:
 *   apps/desktop/icon.iconset/  — PNG files for all required sizes
 *   apps/desktop/icon.icns      — macOS icon bundle (via iconutil)
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const MASTER = resolve(ROOT, "assets/icon-1024.png");
const ICONSET = resolve(ROOT, "icon.iconset");

/** Required icon sizes for macOS .iconset (name → pixel size). */
const ICON_SIZES: Array<{ name: string; size: number }> = [
	{ name: "icon_16x16.png", size: 16 },
	{ name: "icon_16x16@2x.png", size: 32 },
	{ name: "icon_32x32.png", size: 32 },
	{ name: "icon_32x32@2x.png", size: 64 },
	{ name: "icon_128x128.png", size: 128 },
	{ name: "icon_128x128@2x.png", size: 256 },
	{ name: "icon_256x256.png", size: 256 },
	{ name: "icon_256x256@2x.png", size: 512 },
	{ name: "icon_512x512.png", size: 512 },
	{ name: "icon_512x512@2x.png", size: 1024 },
];

async function run(cmd: string[]): Promise<void> {
	const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Command failed: ${cmd.join(" ")}\n${stderr}`);
	}
}

async function main(): Promise<void> {
	if (!existsSync(MASTER)) {
		console.error(`Master icon not found: ${MASTER}`);
		console.error("Create a 1024x1024 PNG at apps/desktop/assets/icon-1024.png first.");
		process.exit(1);
	}

	// Ensure iconset directory exists
	await Bun.write(resolve(ICONSET, ".gitkeep"), "");

	console.log("Generating iconset PNGs from master icon...");

	for (const { name, size } of ICON_SIZES) {
		const outPath = resolve(ICONSET, name);
		// Copy master, then resize with sips
		await Bun.write(outPath, Bun.file(MASTER));
		await run(["sips", "-z", String(size), String(size), outPath, "--out", outPath]);
		console.log(`  ✓ ${name} (${size}×${size})`);
	}

	// Generate .icns from the iconset
	const icnsPath = resolve(ROOT, "icon.icns");
	await run(["iconutil", "-c", "icns", ICONSET, "-o", icnsPath]);
	console.log(`\n✅ Generated ${icnsPath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
