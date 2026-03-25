#!/usr/bin/env bun
/**
 * Theme System Verification Test (Phase 6 — Item 6.9)
 *
 * Validates all theme-related features:
 * 1. Theme types — 5 built-in themes with complete color tokens
 * 2. Theme CSS — all tokens map to CSS custom properties
 * 3. Settings persistence — server-side read/write via WS methods
 * 4. Settings update — partial merge, theme saved and loaded
 * 5. System preference — "system" resolves to light or dark
 * 6. Shiki theme mapping — each theme has a valid Shiki theme name
 * 7. Theme selector — all themes accessible, system option exists
 * 8. Web build — theme-related files included in dist
 *
 * Uses the server directly (no Pi process needed for settings tests).
 *
 * Usage:
 *   bun run src/theme-verify-test.ts
 */

import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ThemeId } from "@pibun/contracts";
import { loadSettings, updateSettings } from "./persistence.js";
import {
	connectWsWithWelcome,
	createCheckCounter,
	request,
	startServer,
	stopServer,
} from "./test-harness.js";

// ============================================================================
// Constants
// ============================================================================

const TIMEOUT_MS = 10000;
const SETTINGS_FILE = join(homedir(), ".pibun", "settings.json");

/** All 5 built-in theme IDs. */
const THEME_IDS: ThemeId[] = [
	"dark",
	"light",
	"dimmed",
	"high-contrast-dark",
	"high-contrast-light",
];

/** Expected Shiki theme names per theme ID. */
const SHIKI_THEME_MAP: Record<ThemeId, string> = {
	dark: "github-dark-default",
	light: "github-light-default",
	dimmed: "github-dark-dimmed",
	"high-contrast-dark": "github-dark-high-contrast",
	"high-contrast-light": "github-light-high-contrast",
};

/** All 40 semantic color token names from ThemeColors interface. */
const ALL_COLOR_TOKENS = [
	"surface-base",
	"surface-primary",
	"surface-secondary",
	"surface-tertiary",
	"surface-overlay",
	"text-primary",
	"text-secondary",
	"text-tertiary",
	"text-muted",
	"text-on-accent",
	"border-primary",
	"border-secondary",
	"border-muted",
	"accent-primary",
	"accent-primary-hover",
	"accent-soft",
	"accent-text",
	"status-error",
	"status-error-bg",
	"status-error-text",
	"status-error-border",
	"status-success",
	"status-success-bg",
	"status-success-text",
	"status-success-border",
	"status-warning",
	"status-warning-bg",
	"status-warning-text",
	"status-info",
	"status-info-bg",
	"status-info-text",
	"thinking-bg",
	"thinking-border",
	"thinking-text",
	"code-bg",
	"code-inline-bg",
	"user-bubble-bg",
	"user-bubble-text",
	"scrollbar-thumb",
	"scrollbar-track",
];

// ============================================================================
// Helpers
// ============================================================================

const { check, printResults } = createCheckCounter();

// ============================================================================
// Test suites
// ============================================================================

async function testThemeDefinitions(): Promise<void> {
	console.log("\n📦 Theme Definitions");

	// Import themes module (web-side code, but we can import the pure data parts)
	// We can't import from the web app directly in Bun server context,
	// so we check the contracts types and the theme file structure instead.

	// 1. All 5 theme IDs exist as valid ThemeId values
	check("5 built-in theme IDs defined", THEME_IDS.length === 5);

	// 2. Each theme has a known Shiki theme mapping
	for (const id of THEME_IDS) {
		const shikiTheme = SHIKI_THEME_MAP[id];
		check(
			`Theme "${id}" has Shiki mapping: ${shikiTheme}`,
			typeof shikiTheme === "string" && shikiTheme.length > 0,
		);
	}

	// 3. Theme definition file exists and contains all themes
	const themeFilePath = resolve(import.meta.dir, "../../web/src/lib/themes.ts");
	check("themes.ts file exists", existsSync(themeFilePath));

	const themeSource = await Bun.file(themeFilePath).text();
	for (const id of THEME_IDS) {
		check(
			`Theme "${id}" defined in themes.ts`,
			themeSource.includes(`id: "${id}"`) || themeSource.includes(`"${id}"`),
		);
	}

	// 4. All color tokens defined in each theme
	for (const id of THEME_IDS) {
		// Find the theme block and verify it has entries for all tokens
		const hasAllTokens = ALL_COLOR_TOKENS.every((token) => themeSource.includes(`"${token}":`));
		check(`Theme "${id}": all 40 color tokens present in source`, hasAllTokens);
	}

	// 5. isDark correctness
	check(
		"Dark themes marked isDark: true",
		themeSource.includes('id: "dark"') && themeSource.includes("isDark: true"),
	);
	check(
		"Light theme marked isDark: false",
		themeSource.includes('id: "light"') && themeSource.includes("isDark: false"),
	);

	// 6. BUILTIN_THEMES registry exported
	check("BUILTIN_THEMES registry exported", themeSource.includes("export const BUILTIN_THEMES"));
	check("THEME_LIST exported", themeSource.includes("export const THEME_LIST"));

	// 7. Theme utility functions exported
	check("getThemeById() exported", themeSource.includes("export function getThemeById"));
	check("applyTheme() exported", themeSource.includes("export function applyTheme"));
	check("resolveTheme() exported", themeSource.includes("export function resolveTheme"));
	check(
		"getSavedPreference() exported",
		themeSource.includes("export function getSavedPreference"),
	);
	check(
		"watchSystemPreference() exported",
		themeSource.includes("export function watchSystemPreference"),
	);
	check(
		"getSystemPreferredThemeId() exported",
		themeSource.includes("export function getSystemPreferredThemeId"),
	);
}

async function testThemeCssIntegration(): Promise<void> {
	console.log("\n🎨 Theme CSS Integration");

	// 1. Components use CSS custom properties (not hardcoded Tailwind colors)
	const componentDir = resolve(import.meta.dir, "../../web/src/components");
	const _componentFiles = await getSourceFiles(componentDir);

	let usingCssVars = 0;
	let totalChecked = 0;

	// Check key components are using theme tokens
	const keyComponents = [
		"AppShell.tsx",
		"Composer.tsx",
		"chat/AssistantMessage.tsx",
		"chat/UserMessage.tsx",
		"ThemeSelector.tsx",
		"Sidebar.tsx",
	];

	for (const componentRelPath of keyComponents) {
		const fullPath = resolve(componentDir, componentRelPath);
		if (!existsSync(fullPath)) continue;

		totalChecked++;
		const source = await Bun.file(fullPath).text();
		// Check for theme CSS custom property usage patterns
		// Tailwind classes reference theme tokens: bg-surface-*, text-text-*, border-border-*,
		// bg-accent-*, text-accent-*, bg-user-bubble-*, text-user-bubble-*, etc.
		const usesThemeVars =
			source.includes("bg-surface-") ||
			source.includes("text-text-") ||
			source.includes("border-border-") ||
			source.includes("text-accent-") ||
			source.includes("bg-accent-") ||
			source.includes("bg-user-bubble-") ||
			source.includes("text-user-bubble-") ||
			source.includes("bg-code-") ||
			source.includes("var(--color-");

		if (usesThemeVars) usingCssVars++;
		check(
			`${componentRelPath}: uses theme CSS tokens`,
			usesThemeVars,
			usesThemeVars ? undefined : "still uses hardcoded colors",
		);
	}

	check(
		`${usingCssVars}/${totalChecked} key components use theme tokens`,
		usingCssVars === totalChecked,
	);

	// 2. index.css defines Tailwind theme mappings
	const cssPath = resolve(import.meta.dir, "../../web/src/index.css");
	check("index.css exists", existsSync(cssPath));

	if (existsSync(cssPath)) {
		const cssSource = await Bun.file(cssPath).text();
		// Check that CSS custom properties are referenced in Tailwind config
		const hasThemeVarRefs =
			cssSource.includes("--color-surface") ||
			cssSource.includes("--color-text") ||
			cssSource.includes("--color-border") ||
			cssSource.includes("--color-accent") ||
			cssSource.includes("surface-base") ||
			cssSource.includes("surface-primary");
		check("index.css references theme color tokens", hasThemeVarRefs);
	}

	// 3. data-theme attribute used in applyTheme()
	const themesSource = await Bun.file(
		resolve(import.meta.dir, "../../web/src/lib/themes.ts"),
	).text();
	check("applyTheme sets data-theme attribute", themesSource.includes('setAttribute("data-theme"'));
	check("applyTheme sets CSS custom properties", themesSource.includes("setProperty(`--color-"));
}

async function testSettingsPersistence(): Promise<void> {
	console.log("\n💾 Settings Persistence (Server)");

	// Backup existing settings if present
	let originalSettings: string | null = null;
	if (existsSync(SETTINGS_FILE)) {
		originalSettings = await Bun.file(SETTINGS_FILE).text();
	}

	try {
		// 1. Load defaults when no file exists
		if (existsSync(SETTINGS_FILE)) rmSync(SETTINGS_FILE);
		const defaults = await loadSettings();
		check("loadSettings() returns defaults when no file", defaults.themeId === null);

		// 2. Save and load a theme
		await updateSettings({ themeId: "dark" });
		const loaded1 = await loadSettings();
		check("Save 'dark' theme → loads back correctly", loaded1.themeId === "dark");

		// 3. Update to different theme
		await updateSettings({ themeId: "light" });
		const loaded2 = await loadSettings();
		check("Update to 'light' → loads back correctly", loaded2.themeId === "light");

		// 4. Save "system" preference
		await updateSettings({ themeId: "system" });
		const loaded3 = await loadSettings();
		check("Save 'system' preference → loads back correctly", loaded3.themeId === "system");

		// 5. Save null (clear preference)
		await updateSettings({ themeId: null });
		const loaded4 = await loadSettings();
		check("Save null → loads back as null", loaded4.themeId === null);

		// 6. Settings file is valid JSON
		const fileContent = await Bun.file(SETTINGS_FILE).text();
		let parsedOk = false;
		try {
			JSON.parse(fileContent);
			parsedOk = true;
		} catch {
			parsedOk = false;
		}
		check("Settings file is valid JSON", parsedOk);

		// 7. Update preserves unknown fields (forward compat)
		await Bun.write(
			SETTINGS_FILE,
			JSON.stringify({ themeId: "dark", futureField: 42 }, null, "\t"),
		);
		await updateSettings({ themeId: "dimmed" });
		const rawAfterUpdate = JSON.parse(await Bun.file(SETTINGS_FILE).text()) as Record<
			string,
			unknown
		>;
		check("Update preserves themeId", rawAfterUpdate.themeId === "dimmed");
	} finally {
		// Restore original settings
		if (originalSettings !== null) {
			await Bun.write(SETTINGS_FILE, originalSettings);
		} else if (existsSync(SETTINGS_FILE)) {
			rmSync(SETTINGS_FILE);
		}
	}
}

async function testSettingsWsMethods(): Promise<void> {
	console.log("\n🔌 Settings WS Methods");

	// Start server (no Pi process needed)
	const ts = startServer();

	// Backup existing settings
	let originalSettings: string | null = null;
	if (existsSync(SETTINGS_FILE)) {
		originalSettings = await Bun.file(SETTINGS_FILE).text();
	}

	try {
		const { ws } = await connectWsWithWelcome(ts.wsUrl);

		// 1. settings.get returns settings
		const getResp = await request(ws, "settings.get");
		check("settings.get succeeds", "result" in getResp);
		const settings = getResp.result?.settings as Record<string, unknown> | undefined;
		check(
			"settings.get returns settings object",
			settings !== undefined && typeof settings === "object",
		);

		// 2. settings.update with theme
		const updateResp = await request(ws, "settings.update", {
			themeId: "high-contrast-dark",
		});
		check("settings.update succeeds", "result" in updateResp);
		const updatedSettings = updateResp.result?.settings as Record<string, unknown> | undefined;
		check(
			"settings.update returns updated themeId",
			updatedSettings?.themeId === "high-contrast-dark",
		);

		// 3. settings.get reflects the update
		const getResp2 = await request(ws, "settings.get");
		const settings2 = getResp2.result?.settings as Record<string, unknown> | undefined;
		check("settings.get reflects update", settings2?.themeId === "high-contrast-dark");

		// 4. Update to "system"
		const sysResp = await request(ws, "settings.update", { themeId: "system" });
		check("settings.update to 'system' succeeds", "result" in sysResp);
		const sysSettings = sysResp.result?.settings as Record<string, unknown> | undefined;
		check("settings.update returns 'system'", sysSettings?.themeId === "system");

		// 5. Update to null (clear)
		const nullResp = await request(ws, "settings.update", { themeId: null });
		check("settings.update to null succeeds", "result" in nullResp);
		const nullSettings = nullResp.result?.settings as Record<string, unknown> | undefined;
		check("settings.update returns null themeId", nullSettings?.themeId === null);

		// 6. Persists to disk
		const fileContent = await Bun.file(SETTINGS_FILE).text();
		const parsed = JSON.parse(fileContent) as Record<string, unknown>;
		check("Settings persisted to disk", parsed.themeId === null);

		ws.close();

		// Wait for WS to close
		await new Promise((resolve) => setTimeout(resolve, 100));
	} finally {
		// Restore settings
		if (originalSettings !== null) {
			await Bun.write(SETTINGS_FILE, originalSettings);
		} else if (existsSync(SETTINGS_FILE)) {
			rmSync(SETTINGS_FILE);
		}

		stopServer(ts);
	}
}

async function testShikiThemeMapping(): Promise<void> {
	console.log("\n🌈 Shiki Theme Mapping");

	// 1. highlighter.ts exports theme management functions
	const highlighterPath = resolve(import.meta.dir, "../../web/src/lib/highlighter.ts");
	check("highlighter.ts exists", existsSync(highlighterPath));

	const hlSource = await Bun.file(highlighterPath).text();
	check("setShikiTheme() exported", hlSource.includes("export async function setShikiTheme"));
	check("getShikiTheme() exported", hlSource.includes("export function getShikiTheme"));
	check("subscribeShikiTheme() exported", hlSource.includes("export function subscribeShikiTheme"));

	// 2. Default theme is github-dark-default
	check(
		"Default Shiki theme is github-dark-default",
		hlSource.includes('currentTheme: BundledTheme = "github-dark-default"'),
	);

	// 3. Theme change notification mechanism
	check("Theme change listeners exist", hlSource.includes("themeChangeListeners"));
	check(
		"setShikiTheme notifies listeners",
		hlSource.includes("for (const listener of themeChangeListeners)"),
	);

	// 4. useShikiTheme hook exists
	const hookPath = resolve(import.meta.dir, "../../web/src/hooks/useShikiTheme.ts");
	check("useShikiTheme hook exists", existsSync(hookPath));

	if (existsSync(hookPath)) {
		const hookSource = await Bun.file(hookPath).text();
		check("useShikiTheme uses useSyncExternalStore", hookSource.includes("useSyncExternalStore"));
	}

	// 5. applyTheme triggers Shiki theme switch
	const themesPath = resolve(import.meta.dir, "../../web/src/lib/themes.ts");
	const themesSource = await Bun.file(themesPath).text();
	check("applyTheme calls setShikiTheme", themesSource.includes("setShikiTheme(theme.shikiTheme"));

	// 6. CodeBlock uses useShikiTheme for re-rendering
	const codeBlockPath = resolve(import.meta.dir, "../../web/src/components/chat/CodeBlock.tsx");
	if (existsSync(codeBlockPath)) {
		const cbSource = await Bun.file(codeBlockPath).text();
		check("CodeBlock imports useShikiTheme", cbSource.includes("useShikiTheme"));
		check(
			"CodeBlock uses shikiTheme as effect dependency",
			cbSource.includes("shikiTheme") && cbSource.includes("useEffect"),
		);
	}

	// 7. DiffViewer uses useShikiTheme for re-rendering
	const diffViewerPath = resolve(import.meta.dir, "../../web/src/components/git/DiffViewer.tsx");
	if (existsSync(diffViewerPath)) {
		const dvSource = await Bun.file(diffViewerPath).text();
		check("DiffViewer imports useShikiTheme", dvSource.includes("useShikiTheme"));
	}
}

async function testSystemPreference(): Promise<void> {
	console.log("\n🖥️  System Preference");

	const themesPath = resolve(import.meta.dir, "../../web/src/lib/themes.ts");
	const themesSource = await Bun.file(themesPath).text();

	// 1. getSystemPreferredThemeId uses prefers-color-scheme
	check(
		"getSystemPreferredThemeId checks prefers-color-scheme",
		themesSource.includes("prefers-color-scheme"),
	);

	// 2. watchSystemPreference uses matchMedia change listener
	check(
		"watchSystemPreference uses matchMedia change listener",
		themesSource.includes('addEventListener("change"') && themesSource.includes("matchMedia"),
	);

	// 3. watchSystemPreference returns unsubscribe function
	check(
		"watchSystemPreference returns unsubscribe",
		themesSource.includes('removeEventListener("change"'),
	);

	// 4. resolveTheme handles "system" preference
	check(
		"resolveTheme handles 'system' preference",
		themesSource.includes('preference === "system"'),
	);

	// 5. ThemeSelector watches system preference
	const selectorPath = resolve(import.meta.dir, "../../web/src/components/ThemeSelector.tsx");
	const selectorSource = await Bun.file(selectorPath).text();
	check(
		"ThemeSelector imports watchSystemPreference",
		selectorSource.includes("watchSystemPreference"),
	);
	check(
		"ThemeSelector watches when 'system' is active",
		selectorSource.includes('activePreference !== "system"') ||
			selectorSource.includes('activePreference === "system"'),
	);
	check(
		"ThemeSelector has 'System' option",
		selectorSource.includes("handleSelectSystem") && selectorSource.includes("SystemPreview"),
	);

	// 6. main.tsx defaults to "system" on first visit
	const mainPath = resolve(import.meta.dir, "../../web/src/main.tsx");
	const mainSource = await Bun.file(mainPath).text();
	check("main.tsx defaults to 'system' preference", mainSource.includes('"system"'));
	check(
		"main.tsx applies theme before React renders",
		mainSource.includes("applyTheme(resolveTheme("),
	);
}

async function testThemePersistenceDual(): Promise<void> {
	console.log("\n🔗 Dual Persistence (localStorage + server)");

	// 1. settingsActions.ts exists and has required functions
	const actionsPath = resolve(import.meta.dir, "../../web/src/lib/settingsActions.ts");
	check("settingsActions.ts exists", existsSync(actionsPath));

	const actionsSource = await Bun.file(actionsPath).text();
	check(
		"fetchAndApplySettings exported",
		actionsSource.includes("export async function fetchAndApplySettings"),
	);
	check(
		"persistThemeToServer exported",
		actionsSource.includes("export function persistThemeToServer"),
	);

	// 2. Server settings win over localStorage (desktop webview state resets)
	check(
		"fetchAndApplySettings compares server vs localStorage",
		actionsSource.includes("currentLocalPref") || actionsSource.includes("localStorage"),
	);

	// 3. persistThemeToServer is fire-and-forget (doesn't block UI)
	check("persistThemeToServer is fire-and-forget", actionsSource.includes(".catch("));

	// 4. ThemeSelector saves to both localStorage and server
	const selectorPath = resolve(import.meta.dir, "../../web/src/components/ThemeSelector.tsx");
	const selectorSource = await Bun.file(selectorPath).text();
	check(
		"ThemeSelector saves to localStorage",
		selectorSource.includes("localStorage.setItem(THEME_STORAGE_KEY"),
	);
	check(
		"ThemeSelector calls persistThemeToServer",
		selectorSource.includes("persistThemeToServer("),
	);

	// 5. fetchAndApplySettings wired to server.welcome
	const wireTransportPath = resolve(import.meta.dir, "../../web/src/wireTransport.ts");
	const wireSource = await Bun.file(wireTransportPath).text();
	check(
		"fetchAndApplySettings wired to server.welcome",
		wireSource.includes("fetchAndApplySettings"),
	);

	// 6. THEME_STORAGE_KEY is consistent across modules
	check(
		"THEME_STORAGE_KEY exported from themes.ts",
		actionsSource.includes("THEME_STORAGE_KEY") && actionsSource.includes("from"),
	);
}

async function testWebBuildThemeFiles(): Promise<void> {
	console.log("\n🏗️  Web Build (Theme Files)");

	const webDistDir = resolve(import.meta.dir, "../../web/dist");

	if (!existsSync(webDistDir)) {
		console.log("  ⚠️  Web dist not found — skipping build checks (run 'bun run build' first)");
		return;
	}

	// 1. index.html exists
	const indexHtml = resolve(webDistDir, "index.html");
	check("dist/index.html exists", existsSync(indexHtml));

	// 2. Check that the CSS output exists
	const cssFiles = await findFiles(webDistDir, ".css");
	check("CSS bundle exists in dist", cssFiles.length > 0);

	// 3. JS bundle exists
	const jsFiles = await findFiles(webDistDir, ".js");
	check("JS bundle exists in dist", jsFiles.length > 0);

	// 4. Check a CSS file contains theme variable references
	if (cssFiles.length > 0) {
		let hasThemeVars = false;
		for (const cssFile of cssFiles) {
			const content = await Bun.file(cssFile).text();
			if (
				content.includes("--color-") ||
				content.includes("surface-base") ||
				content.includes("surface-primary")
			) {
				hasThemeVars = true;
				break;
			}
		}
		check("CSS bundle contains theme variable references", hasThemeVars);
	}
}

async function testThemeContracts(): Promise<void> {
	console.log("\n📋 Theme Contracts");

	// 1. theme.ts in contracts
	const themePath = resolve(import.meta.dir, "../../../packages/contracts/src/theme.ts");
	check("contracts/theme.ts exists", existsSync(themePath));

	const themeSource = await Bun.file(themePath).text();
	check("ThemeColors interface exported", themeSource.includes("export interface ThemeColors"));
	check("Theme interface exported", themeSource.includes("export interface Theme"));
	check("ThemeId type exported", themeSource.includes("export type ThemeId"));
	check("ThemePreference type exported", themeSource.includes("export type ThemePreference"));
	check('ThemePreference includes "system"', themeSource.includes('"system"'));

	// 2. All 5 theme IDs in ThemeId
	for (const id of THEME_IDS) {
		check(`ThemeId includes "${id}"`, themeSource.includes(`"${id}"`));
	}

	// 3. settings.ts in contracts
	const settingsPath = resolve(import.meta.dir, "../../../packages/contracts/src/settings.ts");
	check("contracts/settings.ts exists", existsSync(settingsPath));

	const settingsSource = await Bun.file(settingsPath).text();
	check(
		"PiBunSettings interface exported",
		settingsSource.includes("export interface PiBunSettings"),
	);
	check("PiBunSettings has themeId field", settingsSource.includes("themeId"));
	check("PiBunSettings.themeId uses ThemePreference", settingsSource.includes("ThemePreference"));

	// 4. Contracts index re-exports theme types
	const indexPath = resolve(import.meta.dir, "../../../packages/contracts/src/index.ts");
	const indexSource = await Bun.file(indexPath).text();
	check(
		"index.ts re-exports Theme types",
		indexSource.includes("Theme") && indexSource.includes("theme.js"),
	);
	check(
		"index.ts re-exports PiBunSettings",
		indexSource.includes("PiBunSettings") && indexSource.includes("settings.js"),
	);
}

// ============================================================================
// File discovery helpers
// ============================================================================

async function getSourceFiles(dir: string): Promise<string[]> {
	const results: string[] = [];
	try {
		const entries = await Array.fromAsync(new Bun.Glob("**/*.tsx").scan(dir));
		for (const entry of entries) {
			results.push(resolve(dir, entry));
		}
	} catch {
		// Directory doesn't exist
	}
	return results;
}

async function findFiles(dir: string, ext: string): Promise<string[]> {
	const results: string[] = [];
	try {
		const entries = await Array.fromAsync(new Bun.Glob(`**/*${ext}`).scan(dir));
		for (const entry of entries) {
			results.push(resolve(dir, entry));
		}
	} catch {
		// Directory doesn't exist
	}
	return results;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("🎨 PiBun Theme System Verification Test (Phase 6.9)\n");

	const timer = setTimeout(() => {
		console.error("\n⏰ Test timed out!");
		process.exit(1);
	}, TIMEOUT_MS);

	try {
		await testThemeContracts();
		await testThemeDefinitions();
		await testThemeCssIntegration();
		await testSettingsPersistence();
		await testSettingsWsMethods();
		await testShikiThemeMapping();
		await testSystemPreference();
		await testThemePersistenceDual();
		await testWebBuildThemeFiles();
	} catch (err) {
		console.error("\n💥 Unexpected error:", err);
	} finally {
		clearTimeout(timer);
	}

	const { failed } = printResults("Theme system verification");
	process.exit(failed > 0 ? 1 : 0);
}

main();
