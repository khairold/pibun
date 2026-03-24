/**
 * Plugin persistence — reads/writes `~/.pibun/plugins/` directory.
 *
 * Plugins are directories under `~/.pibun/plugins/`, each containing a
 * `plugin.json` manifest. The store scans the directory on startup,
 * validates manifests, and tracks enabled/disabled state.
 *
 * Plugin enabled/disabled state is persisted in `~/.pibun/plugins-state.json`
 * (a simple `Record<pluginId, { enabled: boolean }>`). This is separate from
 * `settings.json` to keep concerns isolated.
 *
 * @module
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Plugin, PluginManifest, PluginPanelConfig } from "@pibun/contracts";

// ============================================================================
// Constants
// ============================================================================

/** PiBun config directory. */
const PIBUN_CONFIG_DIR = join(homedir(), ".pibun");

/** Directory where plugins are installed. */
const PLUGINS_DIR = join(PIBUN_CONFIG_DIR, "plugins");

/**
 * Get the absolute path to a plugin's directory.
 * Returns the path even if the directory doesn't exist — caller must check.
 */
export function getPluginDir(pluginId: string): string {
	return join(PLUGINS_DIR, pluginId);
}

/** File tracking plugin enabled/disabled state. */
const PLUGINS_STATE_FILE = join(PIBUN_CONFIG_DIR, "plugins-state.json");

/** Expected manifest filename inside each plugin directory. */
const MANIFEST_FILENAME = "plugin.json";

// ============================================================================
// Plugin State Persistence
// ============================================================================

/**
 * Per-plugin persisted state (currently just enabled/disabled).
 */
interface PluginPersistedState {
	enabled: boolean;
}

/**
 * Map of plugin ID → persisted state.
 */
type PluginsState = Record<string, PluginPersistedState>;

/**
 * Load the plugins state file.
 * Returns empty object if file doesn't exist or is malformed.
 */
async function loadPluginsState(): Promise<PluginsState> {
	try {
		const file = Bun.file(PLUGINS_STATE_FILE);
		const exists = await file.exists();
		if (!exists) return {};

		const text = await file.text();
		const parsed: unknown = JSON.parse(text);

		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return {};
		}

		// Validate shape: each value must have `enabled: boolean`
		const raw = parsed as Record<string, unknown>;
		const state: PluginsState = {};

		for (const [id, value] of Object.entries(raw)) {
			if (
				typeof value === "object" &&
				value !== null &&
				typeof (value as Record<string, unknown>).enabled === "boolean"
			) {
				state[id] = { enabled: (value as Record<string, unknown>).enabled as boolean };
			}
		}

		return state;
	} catch {
		return {};
	}
}

/**
 * Save the plugins state file.
 * Creates the `~/.pibun/` directory if it doesn't exist.
 */
async function savePluginsState(state: PluginsState): Promise<void> {
	await mkdir(PIBUN_CONFIG_DIR, { recursive: true });
	await Bun.write(PLUGINS_STATE_FILE, JSON.stringify(state, null, "\t"));
}

// ============================================================================
// Manifest Validation
// ============================================================================

/**
 * Validate a parsed JSON object as a `PluginManifest`.
 *
 * Returns a validated manifest or an error string.
 */
function validateManifest(raw: unknown): PluginManifest | string {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return "manifest must be a JSON object";
	}

	const obj = raw as Record<string, unknown>;

	// Required string fields
	if (typeof obj.id !== "string" || obj.id.length === 0) {
		return "manifest.id must be a non-empty string";
	}
	if (typeof obj.name !== "string" || obj.name.length === 0) {
		return "manifest.name must be a non-empty string";
	}
	if (typeof obj.version !== "string" || obj.version.length === 0) {
		return "manifest.version must be a non-empty string";
	}
	if (typeof obj.description !== "string") {
		return "manifest.description must be a string";
	}

	// Optional author
	const author = typeof obj.author === "string" ? obj.author : null;

	// Panels array — at least one required
	if (!Array.isArray(obj.panels) || obj.panels.length === 0) {
		return "manifest.panels must be a non-empty array";
	}

	const panels: PluginPanelConfig[] = [];
	for (let i = 0; i < obj.panels.length; i++) {
		const panelResult = validatePanel(obj.panels[i], i);
		if (typeof panelResult === "string") {
			return panelResult;
		}
		panels.push(panelResult);
	}

	return {
		id: obj.id as string,
		name: obj.name as string,
		version: obj.version as string,
		description: obj.description as string,
		author,
		panels,
	};
}

/**
 * Validate a single panel config entry.
 */
function validatePanel(raw: unknown, index: number): PluginPanelConfig | string {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return `panels[${index}] must be an object`;
	}

	const obj = raw as Record<string, unknown>;

	if (typeof obj.id !== "string" || obj.id.length === 0) {
		return `panels[${index}].id must be a non-empty string`;
	}
	if (typeof obj.title !== "string" || obj.title.length === 0) {
		return `panels[${index}].title must be a non-empty string`;
	}
	if (typeof obj.icon !== "string" || obj.icon.length === 0) {
		return `panels[${index}].icon must be a non-empty string`;
	}
	if (obj.position !== "sidebar" && obj.position !== "bottom" && obj.position !== "right") {
		return `panels[${index}].position must be "sidebar", "bottom", or "right"`;
	}
	if (typeof obj.component !== "string" || obj.component.length === 0) {
		return `panels[${index}].component must be a non-empty string`;
	}

	const defaultSize = typeof obj.defaultSize === "number" ? obj.defaultSize : null;

	return {
		id: obj.id as string,
		title: obj.title as string,
		icon: obj.icon as string,
		position: obj.position as PluginPanelConfig["position"],
		component: obj.component as string,
		defaultSize,
	};
}

// ============================================================================
// Plugin Loading
// ============================================================================

/**
 * Ensure the `~/.pibun/plugins/` directory exists.
 */
async function ensurePluginsDir(): Promise<void> {
	await mkdir(PLUGINS_DIR, { recursive: true });
}

/**
 * Load a single plugin from its directory.
 *
 * Reads and validates `plugin.json`. Returns a `Plugin` on success
 * or a `Plugin` with an `error` field on validation failure.
 * Returns `null` if the manifest file doesn't exist at all.
 */
async function loadPluginFromDir(
	dirName: string,
	enabledState: PluginsState,
): Promise<Plugin | null> {
	const pluginDir = join(PLUGINS_DIR, dirName);
	const manifestPath = join(pluginDir, MANIFEST_FILENAME);

	const file = Bun.file(manifestPath);
	const exists = await file.exists();
	if (!exists) {
		// Directory without plugin.json — skip silently
		return null;
	}

	try {
		const text = await file.text();
		const parsed: unknown = JSON.parse(text);
		const result = validateManifest(parsed);

		if (typeof result === "string") {
			// Validation failed — return plugin with error
			return {
				manifest: {
					id: dirName,
					name: dirName,
					version: "0.0.0",
					description: "",
					author: null,
					panels: [],
				},
				enabled: false,
				error: `Invalid manifest: ${result}`,
				directory: pluginDir,
			};
		}

		// Verify manifest ID matches directory name
		if (result.id !== dirName) {
			return {
				manifest: result,
				enabled: false,
				error: `Manifest ID "${result.id}" does not match directory name "${dirName}"`,
				directory: pluginDir,
			};
		}

		// Resolve enabled state — defaults to true for new plugins
		const state = enabledState[result.id];
		const enabled = state ? state.enabled : true;

		return {
			manifest: result,
			enabled,
			error: null,
			directory: pluginDir,
		};
	} catch (err) {
		// JSON parse error or file read error
		const message = err instanceof Error ? err.message : String(err);
		return {
			manifest: {
				id: dirName,
				name: dirName,
				version: "0.0.0",
				description: "",
				author: null,
				panels: [],
			},
			enabled: false,
			error: `Failed to read manifest: ${message}`,
			directory: pluginDir,
		};
	}
}

/**
 * Scan `~/.pibun/plugins/` and load all plugin manifests.
 *
 * Creates the plugins directory if it doesn't exist.
 * Returns all discovered plugins, including ones with errors.
 * Plugins without a `plugin.json` are silently skipped.
 */
export async function loadPlugins(): Promise<Plugin[]> {
	await ensurePluginsDir();

	const enabledState = await loadPluginsState();

	let entries: string[];
	try {
		const dirents = await readdir(PLUGINS_DIR, { withFileTypes: true });
		entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
	} catch {
		return [];
	}

	const plugins: Plugin[] = [];

	for (const dirName of entries) {
		const plugin = await loadPluginFromDir(dirName, enabledState);
		if (plugin) {
			plugins.push(plugin);
		}
	}

	// Sort by name for consistent ordering
	plugins.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

	return plugins;
}

/**
 * Get a single plugin by ID.
 *
 * @returns The plugin or null if not found.
 */
export async function getPlugin(pluginId: string): Promise<Plugin | null> {
	const enabledState = await loadPluginsState();
	return loadPluginFromDir(pluginId, enabledState);
}

// ============================================================================
// Plugin Install / Uninstall
// ============================================================================

/**
 * Install a plugin from a local directory path.
 *
 * Copies the source directory into `~/.pibun/plugins/{manifest.id}/`.
 * Validates the manifest before copying.
 *
 * @param source Absolute path to the plugin source directory.
 * @returns The installed plugin.
 * @throws If the source doesn't contain a valid manifest or copy fails.
 */
export async function installPlugin(source: string): Promise<Plugin> {
	await ensurePluginsDir();

	const sourcePath = resolve(source);
	const manifestPath = join(sourcePath, MANIFEST_FILENAME);

	// Read and validate source manifest
	const file = Bun.file(manifestPath);
	const exists = await file.exists();
	if (!exists) {
		throw new Error(`No ${MANIFEST_FILENAME} found at ${sourcePath}`);
	}

	const text = await file.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`Invalid JSON in ${manifestPath}`);
	}

	const result = validateManifest(parsed);
	if (typeof result === "string") {
		throw new Error(`Invalid plugin manifest: ${result}`);
	}

	const targetDir = join(PLUGINS_DIR, result.id);

	// Remove existing plugin directory if it exists (upgrade)
	const targetExists = await Bun.file(join(targetDir, MANIFEST_FILENAME)).exists();
	if (targetExists) {
		await rm(targetDir, { recursive: true, force: true });
	}

	// Copy source directory to target
	// Use recursive copy via Bun's shell or fs operations
	await copyDirectory(sourcePath, targetDir);

	// Load the freshly installed plugin
	const enabledState = await loadPluginsState();
	const plugin = await loadPluginFromDir(result.id, enabledState);

	if (!plugin) {
		throw new Error("Plugin installation failed — manifest not found after copy");
	}

	return plugin;
}

/**
 * Uninstall a plugin by removing its directory.
 *
 * Also removes its persisted enabled/disabled state.
 *
 * @throws If the plugin directory doesn't exist.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
	const pluginDir = join(PLUGINS_DIR, pluginId);

	const manifestFile = Bun.file(join(pluginDir, MANIFEST_FILENAME));
	const exists = await manifestFile.exists();
	if (!exists) {
		throw new Error(`Plugin not found: ${pluginId}`);
	}

	// Remove plugin directory
	await rm(pluginDir, { recursive: true, force: true });

	// Remove from persisted state
	const state = await loadPluginsState();
	if (pluginId in state) {
		delete state[pluginId];
		await savePluginsState(state);
	}
}

// ============================================================================
// Plugin Enable/Disable
// ============================================================================

/**
 * Set a plugin's enabled/disabled state.
 *
 * Persists the change to `~/.pibun/plugins-state.json`.
 *
 * @throws If the plugin doesn't exist.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
	// Verify plugin exists
	const pluginDir = join(PLUGINS_DIR, pluginId);
	const manifestFile = Bun.file(join(pluginDir, MANIFEST_FILENAME));
	const exists = await manifestFile.exists();
	if (!exists) {
		throw new Error(`Plugin not found: ${pluginId}`);
	}

	const state = await loadPluginsState();
	state[pluginId] = { enabled };
	await savePluginsState(state);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Recursively copy a directory.
 *
 * Uses `readdir` with `withFileTypes` and `Bun.file`/`Bun.write` for
 * efficient file copying.
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });

	const entries = await readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);

		if (entry.isDirectory()) {
			await copyDirectory(srcPath, destPath);
		} else {
			// Read as ArrayBuffer and write — works for all file types
			const content = await Bun.file(srcPath).arrayBuffer();
			await Bun.write(destPath, content);
		}
	}
}
