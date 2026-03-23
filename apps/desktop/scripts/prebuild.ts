#!/usr/bin/env bun
/**
 * Pre-build script for Electrobun desktop builds.
 *
 * Runs before `electrobun build` to ensure all dependencies are built:
 * - packages/contracts (types)
 * - packages/shared (JSONL parser)
 * - apps/server (Bun server — though bundled inline, build validates types)
 * - apps/web (Vite build → dist/ for static file serving)
 *
 * Executed by Electrobun's `scripts.preBuild` hook via `Bun.spawnSync()`.
 * Working directory is `apps/desktop/` (the Electrobun project root).
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

const monorepoRoot = resolve(import.meta.dir, "../../..");

console.log("[prebuild] Building web app and dependencies...");
console.log(`[prebuild] Monorepo root: ${monorepoRoot}`);

// Run turbo build for the web app (which pulls in contracts + shared as deps)
const result = Bun.spawnSync(
	["bun", "run", "turbo", "run", "build", "--filter=@pibun/web"],
	{
		cwd: monorepoRoot,
		stdio: ["ignore", "inherit", "inherit"],
		env: process.env,
	},
);

if (result.exitCode !== 0) {
	console.error("[prebuild] Failed to build web app");
	process.exit(1);
}

// Verify the web dist exists
const webDistDir = resolve(monorepoRoot, "apps/web/dist");
if (!existsSync(webDistDir)) {
	console.error(`[prebuild] Web dist not found at ${webDistDir}`);
	process.exit(1);
}

const indexHtml = resolve(webDistDir, "index.html");
if (!existsSync(indexHtml)) {
	console.error(`[prebuild] index.html not found in web dist`);
	process.exit(1);
}

console.log("[prebuild] Web app built successfully");
console.log(`[prebuild] Web dist: ${webDistDir}`);
