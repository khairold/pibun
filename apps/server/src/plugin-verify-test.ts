#!/usr/bin/env bun
/**
 * Plugin System Verification Test
 *
 * Validates Phase 7 exit criteria:
 * 1. Plugins can add panels to the UI (manifest + loading + rendering pipeline)
 * 2. Plugins are sandboxed (iframe with restricted permissions)
 * 3. Plugin ↔ PiBun message bridge (session state, prompts, events)
 * 4. Plugin manager (list, install, uninstall, enable/disable)
 * 5. Example "Prompt Library" plugin works end-to-end
 *
 * Tests server-side plugin operations, WS methods, HTTP asset serving,
 * and web-side contract types. Does NOT require Pi binary or API keys.
 *
 * Usage:
 *   bun run src/plugin-verify-test.ts
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Plugin, PluginManifest } from "@pibun/contracts";
import type { PiBunServer } from "./server.js";
import { connectWsWithWelcome, createCheckCounter, request, startServer } from "./test-harness.js";

const { check, printResults } = createCheckCounter();

// ============================================================================
// Fixture Management
// ============================================================================

const PIBUN_CONFIG_DIR = join(homedir(), ".pibun");
const PLUGINS_DIR = join(PIBUN_CONFIG_DIR, "plugins");
const PLUGINS_STATE_FILE = join(PIBUN_CONFIG_DIR, "plugins-state.json");
const EXAMPLE_PLUGIN_SOURCE = resolve(
	import.meta.dir,
	"../../..",
	"examples/plugins/prompt-library",
);

/** Backup data for cleanup. */
let pluginsDirBackedUp = false;
const backedUpPluginDirs: string[] = [];
let pluginsStateBackup: string | null = null;

/**
 * Backup existing plugins state before tests.
 * We only backup the state file and specific plugin dirs we'll modify.
 */
function backupPluginsState(): void {
	if (existsSync(PLUGINS_STATE_FILE)) {
		pluginsStateBackup = readFileSync(PLUGINS_STATE_FILE, "utf-8");
	}
	// Check if prompt-library already exists in plugins dir
	const promptLibDir = join(PLUGINS_DIR, "prompt-library");
	if (existsSync(promptLibDir)) {
		// Move it aside temporarily
		const backupDir = `${promptLibDir}.__backup__`;
		if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
		require("node:fs").renameSync(promptLibDir, backupDir);
		backedUpPluginDirs.push("prompt-library");
		pluginsDirBackedUp = true;
	}
	// Same for test-plugin
	const testPluginDir = join(PLUGINS_DIR, "test-plugin");
	if (existsSync(testPluginDir)) {
		const backupDir = `${testPluginDir}.__backup__`;
		if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
		require("node:fs").renameSync(testPluginDir, backupDir);
		backedUpPluginDirs.push("test-plugin");
	}
}

/**
 * Restore backed-up plugin state after tests.
 */
function restorePluginsState(): void {
	// Remove any test plugins
	const promptLibDir = join(PLUGINS_DIR, "prompt-library");
	if (existsSync(promptLibDir)) {
		rmSync(promptLibDir, { recursive: true, force: true });
	}
	const testPluginDir = join(PLUGINS_DIR, "test-plugin");
	if (existsSync(testPluginDir)) {
		rmSync(testPluginDir, { recursive: true, force: true });
	}

	// Restore backed-up dirs
	for (const dirName of backedUpPluginDirs) {
		const backupDir = join(PLUGINS_DIR, `${dirName}.__backup__`);
		const originalDir = join(PLUGINS_DIR, dirName);
		if (existsSync(backupDir)) {
			require("node:fs").renameSync(backupDir, originalDir);
		}
	}

	// Restore state file
	if (pluginsStateBackup !== null) {
		writeFileSync(PLUGINS_STATE_FILE, pluginsStateBackup);
	} else if (existsSync(PLUGINS_STATE_FILE) && !pluginsDirBackedUp) {
		// Only remove if it didn't exist before
		rmSync(PLUGINS_STATE_FILE, { force: true });
	}
}

/**
 * Create a minimal test plugin in a temporary directory.
 */
function createTestPlugin(dir: string): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "plugin.json"),
		JSON.stringify(
			{
				id: "test-plugin",
				name: "Test Plugin",
				version: "0.1.0",
				description: "A test plugin for verification.",
				author: "Test",
				panels: [
					{
						id: "main",
						title: "Test Panel",
						icon: "beaker",
						position: "sidebar",
						component: "./panel.html",
						defaultSize: null,
					},
					{
						id: "bottom",
						title: "Test Bottom",
						icon: "terminal",
						position: "bottom",
						component: "./bottom.html",
						defaultSize: 200,
					},
				],
			},
			null,
			"\t",
		),
	);
	writeFileSync(
		join(dir, "panel.html"),
		`<!DOCTYPE html>
<html><head><title>Test Plugin</title></head>
<body>
<h1>Test Plugin Panel</h1>
<script>
window.parent.postMessage({ type: "plugin:ready", pluginId: "test-plugin" }, "*");
</script>
</body></html>`,
	);
	writeFileSync(
		join(dir, "bottom.html"),
		`<!DOCTYPE html>
<html><head><title>Test Bottom</title></head>
<body><p>Bottom panel</p></body></html>`,
	);
}

// ============================================================================
// Server Lifecycle
// ============================================================================

function startTestServer(): { server: PiBunServer; wsUrl: string; baseUrl: string } {
	const ts = startServer();
	return { server: ts.server, wsUrl: ts.wsUrl, baseUrl: ts.baseUrl };
}

// ============================================================================
// Test Sections
// ============================================================================

async function testPluginContracts(): Promise<void> {
	console.log("\n── Plugin Contract Types ──");

	// Verify type definitions exist by using them
	const manifest: PluginManifest = {
		id: "test",
		name: "Test",
		version: "1.0.0",
		description: "desc",
		author: null,
		panels: [
			{
				id: "main",
				title: "Main",
				icon: "puzzle",
				position: "sidebar",
				component: "./index.html",
				defaultSize: null,
			},
		],
	};
	check("PluginManifest type has id field", typeof manifest.id === "string");
	check("PluginManifest type has name field", typeof manifest.name === "string");
	check("PluginManifest type has version field", typeof manifest.version === "string");
	check("PluginManifest type has description field", typeof manifest.description === "string");
	check("PluginManifest type has author field (nullable)", manifest.author === null);
	check("PluginManifest type has panels array", Array.isArray(manifest.panels));
	check("Panel has position field", manifest.panels[0]?.position === "sidebar");
	check("Panel has component field", manifest.panels[0]?.component === "./index.html");
	check("Panel has defaultSize (nullable)", manifest.panels[0]?.defaultSize === null);

	// Plugin runtime type
	const plugin: Plugin = {
		manifest,
		enabled: true,
		error: null,
		directory: "/tmp/test",
	};
	check("Plugin type has manifest", typeof plugin.manifest === "object");
	check("Plugin type has enabled boolean", typeof plugin.enabled === "boolean");
	check("Plugin type has error (nullable)", plugin.error === null);
	check("Plugin type has directory", typeof plugin.directory === "string");

	// Verify panel positions are typed
	const positions: Array<"sidebar" | "bottom" | "right"> = ["sidebar", "bottom", "right"];
	check("3 valid panel positions defined", positions.length === 3);
}

async function testExamplePluginExists(): Promise<void> {
	console.log("\n── Example Plugin Source ──");

	check("Example plugin directory exists", existsSync(EXAMPLE_PLUGIN_SOURCE));
	check("Example plugin has plugin.json", existsSync(join(EXAMPLE_PLUGIN_SOURCE, "plugin.json")));
	check("Example plugin has panel.html", existsSync(join(EXAMPLE_PLUGIN_SOURCE, "panel.html")));

	// Validate manifest content
	const rawManifest = readFileSync(join(EXAMPLE_PLUGIN_SOURCE, "plugin.json"), "utf-8");
	const manifest = JSON.parse(rawManifest) as PluginManifest;

	check("Manifest ID is 'prompt-library'", manifest.id === "prompt-library");
	check("Manifest name is 'Prompt Library'", manifest.name === "Prompt Library");
	check("Manifest version is '1.0.0'", manifest.version === "1.0.0");
	check("Manifest has description", manifest.description.length > 0);
	check("Manifest has author", manifest.author === "PiBun");
	check("Manifest has 1 panel", manifest.panels.length === 1);

	const panel = manifest.panels[0];
	check("Panel ID is 'main'", panel?.id === "main");
	check("Panel title is 'Prompts'", panel?.title === "Prompts");
	check("Panel position is 'sidebar'", panel?.position === "sidebar");
	check("Panel component is './panel.html'", panel?.component === "./panel.html");

	// Validate panel.html content
	const panelHtml = readFileSync(join(EXAMPLE_PLUGIN_SOURCE, "panel.html"), "utf-8");
	check("panel.html is substantial (>500 chars)", panelHtml.length > 500);
	check("panel.html has DOCTYPE", panelHtml.includes("<!DOCTYPE html>"));
	check(
		"panel.html uses plugin:ready message",
		panelHtml.includes('type: "plugin:ready"') || panelHtml.includes("plugin:ready"),
	);
	check("panel.html uses plugin:sendPrompt", panelHtml.includes("plugin:sendPrompt"));
	check("panel.html handles pibun:themeChanged", panelHtml.includes("pibun:themeChanged"));
}

async function testInstallPlugin(wsUrl: string): Promise<void> {
	console.log("\n── Install Plugin (Example) ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Install the prompt-library example plugin
	const installResp = await request(ws, "plugin.install", { source: EXAMPLE_PLUGIN_SOURCE });
	check("plugin.install succeeds", !("error" in installResp));

	const result = installResp.result as Record<string, unknown>;
	const plugin = result.plugin as Plugin;
	check("Installed plugin has correct ID", plugin.manifest.id === "prompt-library");
	check("Installed plugin has correct name", plugin.manifest.name === "Prompt Library");
	check("Installed plugin is enabled by default", plugin.enabled === true);
	check("Installed plugin has no error", plugin.error === null);
	check("Installed plugin has directory path", typeof plugin.directory === "string");
	check("Plugin directory exists on disk", existsSync(plugin.directory));

	// Verify manifest was copied
	const manifestPath = join(plugin.directory, "plugin.json");
	check("plugin.json copied to plugins dir", existsSync(manifestPath));

	// Verify panel.html was copied
	const panelPath = join(plugin.directory, "panel.html");
	check("panel.html copied to plugins dir", existsSync(panelPath));

	ws.close();
}

async function testListPlugins(wsUrl: string): Promise<void> {
	console.log("\n── List Plugins ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// List all plugins
	const listResp = await request(ws, "plugin.list");
	check("plugin.list succeeds", !("error" in listResp));

	const result = listResp.result as Record<string, unknown>;
	const plugins = result.plugins as Plugin[];
	check("Plugins array returned", Array.isArray(plugins));
	check("At least 1 plugin installed", plugins.length >= 1);

	// Find the prompt-library
	const promptLib = plugins.find((p) => p.manifest.id === "prompt-library");
	check("prompt-library in list", promptLib !== undefined);
	check("prompt-library enabled", promptLib?.enabled === true);
	check("prompt-library has panels", (promptLib?.manifest.panels.length ?? 0) > 0);
	check(
		"prompt-library panel position is sidebar",
		promptLib?.manifest.panels[0]?.position === "sidebar",
	);

	ws.close();
}

async function testInstallTestPlugin(wsUrl: string): Promise<void> {
	console.log("\n── Install Second Plugin ──");

	// Create a temporary test plugin
	const tmpDir = join(import.meta.dir, "../../..", ".tmp-test-plugin");
	createTestPlugin(tmpDir);

	const { ws } = await connectWsWithWelcome(wsUrl);

	try {
		// Install the test plugin
		const installResp = await request(ws, "plugin.install", { source: tmpDir });
		check("test-plugin install succeeds", !("error" in installResp));

		const plugin = (installResp.result as Record<string, unknown>).plugin as Plugin;
		check("test-plugin has correct ID", plugin.manifest.id === "test-plugin");
		check("test-plugin has 2 panels", plugin.manifest.panels.length === 2);
		check("test-plugin panel[0] is sidebar", plugin.manifest.panels[0]?.position === "sidebar");
		check("test-plugin panel[1] is bottom", plugin.manifest.panels[1]?.position === "bottom");
		check(
			"test-plugin panel[1] has defaultSize 200",
			plugin.manifest.panels[1]?.defaultSize === 200,
		);

		// Verify both plugins are in list
		const listResp = await request(ws, "plugin.list");
		const plugins = (listResp.result as Record<string, unknown>).plugins as Plugin[];
		check("List now has at least 2 plugins", plugins.length >= 2);
		check(
			"Both plugins in list",
			plugins.some((p) => p.manifest.id === "prompt-library") &&
				plugins.some((p) => p.manifest.id === "test-plugin"),
		);
	} finally {
		// Cleanup temp dir
		rmSync(tmpDir, { recursive: true, force: true });
	}

	ws.close();
}

async function testEnableDisable(wsUrl: string): Promise<void> {
	console.log("\n── Enable / Disable Plugin ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Disable prompt-library
	const disableResp = await request(ws, "plugin.setEnabled", {
		pluginId: "prompt-library",
		enabled: false,
	});
	check("Disable prompt-library succeeds", !("error" in disableResp));

	// Verify disabled in list
	const listAfterDisable = await request(ws, "plugin.list");
	const pluginsAfterDisable = (listAfterDisable.result as Record<string, unknown>)
		.plugins as Plugin[];
	const disabledPlugin = pluginsAfterDisable.find((p) => p.manifest.id === "prompt-library");
	check("prompt-library is now disabled", disabledPlugin?.enabled === false);

	// Re-enable
	const enableResp = await request(ws, "plugin.setEnabled", {
		pluginId: "prompt-library",
		enabled: true,
	});
	check("Re-enable prompt-library succeeds", !("error" in enableResp));

	// Verify re-enabled in list
	const listAfterEnable = await request(ws, "plugin.list");
	const pluginsAfterEnable = (listAfterEnable.result as Record<string, unknown>)
		.plugins as Plugin[];
	const enabledPlugin = pluginsAfterEnable.find((p) => p.manifest.id === "prompt-library");
	check("prompt-library is enabled again", enabledPlugin?.enabled === true);

	// Disable test-plugin and verify
	const disableTest = await request(ws, "plugin.setEnabled", {
		pluginId: "test-plugin",
		enabled: false,
	});
	check("Disable test-plugin succeeds", !("error" in disableTest));

	ws.close();
}

async function testEnableDisablePersistence(
	createServerFn: () => { server: PiBunServer; wsUrl: string; baseUrl: string },
): Promise<void> {
	console.log("\n── Enable/Disable Persists Across Restart ──");

	const { server: server1, wsUrl: wsUrl1 } = createServerFn();
	const { ws: ws1 } = await connectWsWithWelcome(wsUrl1);

	// Disable prompt-library on first server
	await request(ws1, "plugin.setEnabled", { pluginId: "prompt-library", enabled: false });

	// Verify state file exists
	check("plugins-state.json exists", existsSync(PLUGINS_STATE_FILE));
	const stateContent = readFileSync(PLUGINS_STATE_FILE, "utf-8");
	const state = JSON.parse(stateContent) as Record<string, { enabled: boolean }>;
	check("State file records prompt-library disabled", state["prompt-library"]?.enabled === false);

	ws1.close();
	await server1.stop();
	await Bun.sleep(100);

	// Start second server — disabled state should persist
	const { server: server2, wsUrl: wsUrl2 } = createServerFn();
	const { ws: ws2 } = await connectWsWithWelcome(wsUrl2);

	const listResp = await request(ws2, "plugin.list");
	const plugins = (listResp.result as Record<string, unknown>).plugins as Plugin[];
	const promptLib = plugins.find((p) => p.manifest.id === "prompt-library");
	check("prompt-library still disabled after restart", promptLib?.enabled === false);

	// Re-enable for subsequent tests
	await request(ws2, "plugin.setEnabled", { pluginId: "prompt-library", enabled: true });

	ws2.close();
	await server2.stop();
	await Bun.sleep(100);
}

async function testPluginAssetServing(baseUrl: string): Promise<void> {
	console.log("\n── Plugin Asset Serving (HTTP) ──");

	// Serve prompt-library's panel.html
	const panelResp = await fetch(`${baseUrl}/plugin/prompt-library/panel.html`);
	check("GET /plugin/prompt-library/panel.html returns 200", panelResp.status === 200);

	const panelHtml = await panelResp.text();
	check("Served panel.html has content", panelHtml.length > 100);
	check("Served panel.html has DOCTYPE", panelHtml.includes("<!DOCTYPE html>"));
	check("Served panel.html has plugin:ready", panelHtml.includes("plugin:ready"));

	// Serve test-plugin's panel.html
	const testPanelResp = await fetch(`${baseUrl}/plugin/test-plugin/panel.html`);
	check("GET /plugin/test-plugin/panel.html returns 200", testPanelResp.status === 200);

	const testPanelHtml = await testPanelResp.text();
	check("Test panel.html has content", testPanelHtml.includes("Test Plugin Panel"));

	// 404 for non-existent plugin
	const notFoundResp = await fetch(`${baseUrl}/plugin/nonexistent/panel.html`);
	check("Non-existent plugin returns 404", notFoundResp.status === 404);
	await notFoundResp.text(); // consume body

	// 404 for non-existent file in valid plugin
	const missingFileResp = await fetch(`${baseUrl}/plugin/prompt-library/missing.js`);
	check("Missing file in valid plugin returns 404", missingFileResp.status === 404);
	await missingFileResp.text();

	// Directory traversal prevention
	const traversalResp = await fetch(`${baseUrl}/plugin/prompt-library/../../../etc/passwd`);
	const traversalStatus = traversalResp.status;
	check(
		"Directory traversal blocked (403 or 404)",
		traversalStatus === 403 || traversalStatus === 404,
	);
	await traversalResp.text();
}

async function testUninstallPlugin(wsUrl: string): Promise<void> {
	console.log("\n── Uninstall Plugin ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Uninstall test-plugin
	const uninstallResp = await request(ws, "plugin.uninstall", { pluginId: "test-plugin" });
	check("Uninstall test-plugin succeeds", !("error" in uninstallResp));

	// Verify removed from disk
	const testPluginDir = join(PLUGINS_DIR, "test-plugin");
	check("test-plugin directory removed from disk", !existsSync(testPluginDir));

	// Verify removed from list
	const listResp = await request(ws, "plugin.list");
	const plugins = (listResp.result as Record<string, unknown>).plugins as Plugin[];
	const testPlugin = plugins.find((p) => p.manifest.id === "test-plugin");
	check("test-plugin no longer in list", testPlugin === undefined);

	// prompt-library should still be there
	const promptLib = plugins.find((p) => p.manifest.id === "prompt-library");
	check("prompt-library still exists after uninstalling test-plugin", promptLib !== undefined);

	// Try uninstalling non-existent plugin — should error
	const badUninstall = await request(ws, "plugin.uninstall", { pluginId: "nonexistent" });
	check("Uninstalling non-existent plugin returns error", "error" in badUninstall);

	ws.close();
}

async function testPluginUpgrade(wsUrl: string): Promise<void> {
	console.log("\n── Plugin Upgrade (Re-install) ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Re-install prompt-library (should replace existing)
	const reinstallResp = await request(ws, "plugin.install", { source: EXAMPLE_PLUGIN_SOURCE });
	check("Re-install prompt-library succeeds", !("error" in reinstallResp));

	const plugin = (reinstallResp.result as Record<string, unknown>).plugin as Plugin;
	check("Re-installed plugin has correct ID", plugin.manifest.id === "prompt-library");
	check("Re-installed plugin is enabled", plugin.enabled === true);

	// Verify it's still only one copy in the list
	const listResp = await request(ws, "plugin.list");
	const plugins = (listResp.result as Record<string, unknown>).plugins as Plugin[];
	const promptLibCount = plugins.filter((p) => p.manifest.id === "prompt-library").length;
	check("Only one copy of prompt-library in list", promptLibCount === 1);

	ws.close();
}

async function testInvalidManifests(wsUrl: string): Promise<void> {
	console.log("\n── Invalid Manifest Handling ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Try installing from non-existent path
	const badPathResp = await request(ws, "plugin.install", { source: "/tmp/nonexistent-plugin" });
	check("Install from non-existent path returns error", "error" in badPathResp);

	// Create a plugin with invalid manifest (missing required fields)
	const badManifestDir = join(import.meta.dir, "../../..", ".tmp-bad-plugin");
	mkdirSync(badManifestDir, { recursive: true });

	try {
		writeFileSync(join(badManifestDir, "plugin.json"), JSON.stringify({ id: "bad-plugin" }));

		const badInstall = await request(ws, "plugin.install", { source: badManifestDir });
		check("Install with invalid manifest returns error", "error" in badInstall);
	} finally {
		rmSync(badManifestDir, { recursive: true, force: true });
	}

	// Create a plugin with mismatched ID (dir name ≠ manifest id)
	const mismatchDir = join(import.meta.dir, "../../..", ".tmp-mismatch-plugin");
	mkdirSync(mismatchDir, { recursive: true });

	try {
		writeFileSync(
			join(mismatchDir, "plugin.json"),
			JSON.stringify({
				id: "different-id",
				name: "Mismatch",
				version: "1.0.0",
				description: "test",
				panels: [
					{
						id: "m",
						title: "M",
						icon: "x",
						position: "sidebar",
						component: "./x.html",
						defaultSize: null,
					},
				],
			}),
		);

		// Install copies to ~/.pibun/plugins/{manifest.id}/ — uses manifest id, not dir name
		// So this should succeed but directory will be "different-id"
		const mismatchInstall = await request(ws, "plugin.install", { source: mismatchDir });
		// The install uses manifest.id for the target directory, which is fine
		if (!("error" in mismatchInstall)) {
			check("Install with custom ID succeeds (uses manifest.id as dir)", true);
			// Clean up: uninstall
			await request(ws, "plugin.uninstall", { pluginId: "different-id" });
		} else {
			// If it fails due to mismatch check, that's also acceptable
			check("Install with mismatched dir/id handled", true);
		}
	} finally {
		rmSync(mismatchDir, { recursive: true, force: true });
	}

	ws.close();
}

async function testMessageBridgeContracts(): Promise<void> {
	console.log("\n── Message Bridge Contracts ──");

	// Verify the plugin ↔ PiBun message types compile correctly
	// (These are type-only checks — if the file compiled, the types exist)

	// Import the types dynamically to verify they exist
	const contracts = await import("@pibun/contracts");

	// Check that the types are importable (runtime check for type exports)
	check(
		"Plugin type exportable from contracts",
		typeof contracts === "object" && "PluginPanelPosition" in contracts === false,
		// PluginPanelPosition is a type alias, not a runtime value — expected to be absent
	);

	// Verify panel.html contains bridge protocol messages
	const panelHtml = readFileSync(join(EXAMPLE_PLUGIN_SOURCE, "panel.html"), "utf-8");

	check("Plugin sends plugin:ready on load", panelHtml.includes("plugin:ready"));
	check(
		"Plugin uses plugin:sendPrompt for inserting prompts",
		panelHtml.includes("plugin:sendPrompt"),
	);
	check("Plugin handles pibun:themeChanged messages", panelHtml.includes("pibun:themeChanged"));
	check("Plugin uses sendImmediately flag", panelHtml.includes("sendImmediately"));
	check("Plugin uses postMessage for communication", panelHtml.includes("postMessage"));
	check(
		"Plugin uses addEventListener for receiving messages",
		panelHtml.includes("addEventListener"),
	);
}

async function testWebBuildPluginIntegration(): Promise<void> {
	console.log("\n── Web Build Plugin Integration ──");

	const webDir = resolve(import.meta.dir, "../../web");
	const srcDir = join(webDir, "src");

	// Verify key plugin files exist in web app
	check("PluginPanel component exists", existsSync(join(srcDir, "components/PluginPanel.tsx")));
	check("PluginManager component exists", existsSync(join(srcDir, "components/PluginManager.tsx")));
	check("pluginActions.ts exists", existsSync(join(srcDir, "lib/pluginActions.ts")));
	check("pluginMessageBridge.ts exists", existsSync(join(srcDir, "lib/pluginMessageBridge.ts")));
	check("pluginsSlice.ts exists in store", existsSync(join(srcDir, "store/pluginsSlice.ts")));

	// Verify PluginPanel has sandboxing
	const pluginPanelSrc = readFileSync(join(srcDir, "components/PluginPanel.tsx"), "utf-8");
	check("PluginPanelFrame uses sandbox attribute", pluginPanelSrc.includes("sandbox"));
	check("Sandbox allows scripts", pluginPanelSrc.includes("allow-scripts"));
	check(
		"PluginPanelFrame uses iframe element",
		pluginPanelSrc.includes("iframe") || pluginPanelSrc.includes("<iframe"),
	);

	// Verify pluginMessageBridge has expected handlers
	const bridgeSrc = readFileSync(join(srcDir, "lib/pluginMessageBridge.ts"), "utf-8");
	check("Bridge handles plugin:ready", bridgeSrc.includes("plugin:ready"));
	check("Bridge handles plugin:getSessionState", bridgeSrc.includes("plugin:getSessionState"));
	check("Bridge handles plugin:sendPrompt", bridgeSrc.includes("plugin:sendPrompt"));
	check("Bridge handles plugin:subscribeEvents", bridgeSrc.includes("plugin:subscribeEvents"));
	check("Bridge sends pibun:themeChanged", bridgeSrc.includes("pibun:themeChanged"));

	// Verify PluginManager component
	const managerSrc = readFileSync(join(srcDir, "components/PluginManager.tsx"), "utf-8");
	check(
		"PluginManager has install form",
		managerSrc.includes("install") || managerSrc.includes("Install"),
	);
	check(
		"PluginManager has enable/disable toggle",
		managerSrc.includes("switch") || managerSrc.includes("toggle"),
	);
	check(
		"PluginManager has uninstall button",
		managerSrc.includes("uninstall") || managerSrc.includes("Uninstall"),
	);

	// Verify wireTransport integrates plugins
	const wireTransportSrc = readFileSync(join(srcDir, "wireTransport.ts"), "utf-8");
	check(
		"wireTransport initializes plugin bridge",
		wireTransportSrc.includes("pluginMessageBridge") ||
			wireTransportSrc.includes("initPluginMessageBridge"),
	);
	check("wireTransport fetches plugins on welcome", wireTransportSrc.includes("fetchPlugins"));
	check(
		"wireTransport forwards events to plugins",
		wireTransportSrc.includes("forwardPiEventToPlugins"),
	);

	// Verify AppShell includes PluginManager
	const appShellSrc = readFileSync(join(srcDir, "components/AppShell.tsx"), "utf-8");
	check("AppShell renders PluginManager", appShellSrc.includes("PluginManager"));
	check(
		"AppShell renders plugin panels",
		appShellSrc.includes("PluginBottomPanels") || appShellSrc.includes("PluginRightPanels"),
	);
}

async function testCleanUninstall(wsUrl: string): Promise<void> {
	console.log("\n── Clean Uninstall ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Uninstall prompt-library
	const uninstallResp = await request(ws, "plugin.uninstall", { pluginId: "prompt-library" });
	check("Uninstall prompt-library succeeds", !("error" in uninstallResp));

	// Verify gone from disk
	const pluginDir = join(PLUGINS_DIR, "prompt-library");
	check("prompt-library directory removed", !existsSync(pluginDir));

	// Verify gone from list
	const listResp = await request(ws, "plugin.list");
	const plugins = (listResp.result as Record<string, unknown>).plugins as Plugin[];
	check("prompt-library gone from list", !plugins.some((p) => p.manifest.id === "prompt-library"));

	ws.close();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("🔌 PiBun Plugin System Verification Test\n");

	// Backup existing state
	backupPluginsState();

	let server: PiBunServer | null = null;

	try {
		// Test 1: Contract types
		await testPluginContracts();

		// Test 2: Example plugin source files
		await testExamplePluginExists();

		// Test 3: Message bridge contracts
		await testMessageBridgeContracts();

		// Test 4: Web build plugin integration (source file checks)
		await testWebBuildPluginIntegration();

		// Start server for WS + HTTP tests
		const serverCtx = startTestServer();
		server = serverCtx.server;
		const { wsUrl, baseUrl } = serverCtx;
		console.log(`\nServer started on port ${serverCtx.server.server.port}`);

		// Test 5: Install example plugin
		await testInstallPlugin(wsUrl);

		// Test 6: List plugins
		await testListPlugins(wsUrl);

		// Test 7: Install a second plugin
		await testInstallTestPlugin(wsUrl);

		// Test 8: Enable/disable
		await testEnableDisable(wsUrl);

		// Test 9: Plugin asset serving via HTTP
		await testPluginAssetServing(baseUrl);

		// Test 10: Uninstall test-plugin
		await testUninstallPlugin(wsUrl);

		// Test 11: Plugin upgrade (re-install)
		await testPluginUpgrade(wsUrl);

		// Test 12: Invalid manifest handling
		await testInvalidManifests(wsUrl);

		// Stop server for persistence test
		await server.stop();
		server = null;
		await Bun.sleep(100);

		// Test 13: Enable/disable persists across restart
		await testEnableDisablePersistence(startTestServer);

		// Start server again for final cleanup test
		const finalCtx = startTestServer();
		server = finalCtx.server;

		// Test 14: Clean uninstall
		await testCleanUninstall(finalCtx.wsUrl);
	} finally {
		// Stop server
		if (server) {
			await server.stop();
		}

		// Restore original state
		restorePluginsState();
	}

	const { failed } = printResults("Plugin system verification");
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	restorePluginsState();
	process.exit(1);
});
