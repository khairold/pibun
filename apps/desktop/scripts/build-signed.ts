#!/usr/bin/env bun
/**
 * Build script for code-signed + notarized macOS builds.
 *
 * Validates that all required signing credentials are present as env vars
 * before invoking `electrobun build --env=stable`. This provides clear
 * error messages rather than letting Electrobun fail mid-build.
 *
 * Required env vars for code signing:
 *   ELECTROBUN_DEVELOPER_ID — Apple Developer ID certificate identity
 *     e.g., "Developer ID Application: Your Name (TEAMID)"
 *
 * Required env vars for notarization (one of two methods):
 *
 *   Method 1 — Apple ID (simpler setup):
 *     ELECTROBUN_APPLEID      — Apple ID email
 *     ELECTROBUN_APPLEIDPASS  — App-specific password (NOT your account password)
 *     ELECTROBUN_TEAMID       — Apple Developer Team ID
 *
 *   Method 2 — App Store Connect API Key (recommended for CI):
 *     ELECTROBUN_APPLEAPIISSUER  — Issuer ID from App Store Connect
 *     ELECTROBUN_APPLEAPIKEY     — Key ID
 *     ELECTROBUN_APPLEAPIKEYPATH — Path to .p8 private key file
 *
 * Usage:
 *   bun scripts/build-signed.ts                    # stable build
 *   bun scripts/build-signed.ts --env=canary       # canary build
 *   bun scripts/build-signed.ts --skip-notarize    # sign only, no notarize
 *
 * See docs/CODE_SIGNING.md for full setup instructions.
 */

import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const skipNotarize = args.includes("--skip-notarize");
const envFlag = args.find((a) => a.startsWith("--env=")) ?? "--env=stable";

// ── Validate code signing credentials ───────────────────────────────────

const developerId = process.env.ELECTROBUN_DEVELOPER_ID;
if (!developerId) {
	console.error("❌ ELECTROBUN_DEVELOPER_ID is required for code signing.");
	console.error("");
	console.error("   Set it to your Apple Developer ID certificate identity:");
	console.error(
		'   export ELECTROBUN_DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)"',
	);
	console.error("");
	console.error("   Find your identity with:");
	console.error(
		'   security find-identity -v -p codesigning | grep "Developer ID"',
	);
	console.error("");
	console.error("   See docs/CODE_SIGNING.md for full setup instructions.");
	process.exit(1);
}

console.log(`✅ Code signing identity: ${developerId}`);

// ── Validate notarization credentials (unless skipped) ──────────────────

if (!skipNotarize) {
	const appleId = process.env.ELECTROBUN_APPLEID;
	const appleIdPass = process.env.ELECTROBUN_APPLEIDPASS;
	const teamId = process.env.ELECTROBUN_TEAMID;

	const apiIssuer = process.env.ELECTROBUN_APPLEAPIISSUER;
	const apiKey = process.env.ELECTROBUN_APPLEAPIKEY;
	const apiKeyPath = process.env.ELECTROBUN_APPLEAPIKEYPATH;

	const hasAppleId = appleId && appleIdPass && teamId;
	const hasApiKey = apiIssuer && apiKey && apiKeyPath;

	if (!hasAppleId && !hasApiKey) {
		console.error("❌ Notarization credentials missing.");
		console.error("");
		console.error("   Provide ONE of:");
		console.error("");
		console.error("   Method 1 — Apple ID:");
		console.error(
			'     export ELECTROBUN_APPLEID="your@apple.id"',
		);
		console.error(
			'     export ELECTROBUN_APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"  # app-specific password',
		);
		console.error(
			'     export ELECTROBUN_TEAMID="XXXXXXXXXX"',
		);
		console.error("");
		console.error("   Method 2 — App Store Connect API Key:");
		console.error(
			'     export ELECTROBUN_APPLEAPIISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"',
		);
		console.error(
			'     export ELECTROBUN_APPLEAPIKEY="XXXXXXXXXX"',
		);
		console.error(
			'     export ELECTROBUN_APPLEAPIKEYPATH="/path/to/AuthKey_XXXXXXXXXX.p8"',
		);
		console.error("");
		console.error(
			"   Or pass --skip-notarize to sign without notarizing.",
		);
		console.error("");
		console.error("   See docs/CODE_SIGNING.md for full setup instructions.");
		process.exit(1);
	}

	if (hasApiKey) {
		if (!existsSync(apiKeyPath)) {
			console.error(
				`❌ API key file not found: ${apiKeyPath}`,
			);
			console.error(
				"   Check ELECTROBUN_APPLEAPIKEYPATH points to a valid .p8 file.",
			);
			process.exit(1);
		}
		console.log("✅ Notarization: App Store Connect API Key");
	} else {
		console.log("✅ Notarization: Apple ID");
	}
} else {
	// Clear notarization env vars so Electrobun config detects no notarization
	// (electrobun.config.ts checks for ELECTROBUN_APPLEID or ELECTROBUN_APPLEAPIISSUER)
	for (const key of [
		"ELECTROBUN_APPLEID",
		"ELECTROBUN_APPLEIDPASS",
		"ELECTROBUN_TEAMID",
		"ELECTROBUN_APPLEAPIISSUER",
		"ELECTROBUN_APPLEAPIKEY",
		"ELECTROBUN_APPLEAPIKEYPATH",
	]) {
		delete process.env[key];
	}
	console.log("⏭️  Notarization: skipped (--skip-notarize)");
}

// ── Run the Electrobun build ────────────────────────────────────────────

console.log("");
console.log(`🔨 Building PiBun (${envFlag})...`);
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
console.log("✅ Signed build complete!");
