/**
 * PiBun Desktop — Auto-update integration.
 *
 * Wraps Electrobun's `Updater` module to provide:
 * - Automatic update check on startup (after delay)
 * - Periodic update checks (every 4 hours)
 * - Manual "Check for Updates…" from the PiBun app menu
 * - Status forwarding to the React app via WebSocket push on `app.update`
 *
 * Electrobun's Updater handles the heavy lifting:
 * - Reads `version.json` from the app bundle for current version/hash/channel
 * - Fetches `<baseUrl>/<prefix>-update.json` to check for new versions
 * - Downloads patches (bsdiff) or full tarballs for efficient updates
 * - Extracts and replaces the app bundle, then relaunches
 *
 * @see reference/electrobun/package/src/bun/core/Updater.ts
 */

import type { WsAppUpdateData } from "@pibun/contracts";
import type { PiBunServer } from "@pibun/server/server";
import { broadcastPush } from "@pibun/server/server";
import { Updater } from "electrobun/bun";

// ============================================================================
// Constants
// ============================================================================

/** Delay before first update check after startup (ms). */
const INITIAL_CHECK_DELAY_MS = 10_000; // 10 seconds

/** Interval between periodic update checks (ms). */
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ============================================================================
// Module State
// ============================================================================

/** Reference to the PiBun server for broadcasting WS pushes. */
let serverRef: PiBunServer | null = null;

/** Timer handle for periodic checks. */
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/** Whether an update check is currently in progress. */
let isChecking = false;

/** Latest update status to replay for late-connecting clients. */
let latestStatus: WsAppUpdateData = {
	status: "no-update",
	message: "No update information available",
};

// ============================================================================
// Status Broadcasting
// ============================================================================

/**
 * Broadcast update status to all connected WebSocket clients.
 */
function broadcastUpdateStatus(data: WsAppUpdateData): void {
	latestStatus = data;
	if (serverRef) {
		broadcastPush(serverRef.connections, "app.update", data);
	}
}

// ============================================================================
// Update Check
// ============================================================================

/**
 * Check for available updates.
 *
 * If an update is available, automatically downloads it.
 * Status updates are broadcast to the web UI via the `app.update` push channel.
 *
 * @param silent - If true, don't broadcast "checking" and "no-update" statuses.
 *   Used for periodic background checks to avoid spamming the UI.
 */
async function checkForUpdates(silent = false): Promise<void> {
	if (isChecking) {
		console.log("[Updater] Check already in progress, skipping");
		return;
	}

	isChecking = true;

	try {
		// Check channel — dev builds don't support updates
		const channel = await Updater.localInfo.channel();
		if (channel === "dev") {
			console.log("[Updater] Dev channel — updates disabled");
			if (!silent) {
				broadcastUpdateStatus({
					status: "no-update",
					message: "Updates are disabled in development builds",
				});
			}
			return;
		}

		if (!silent) {
			broadcastUpdateStatus({
				status: "checking",
				message: "Checking for updates…",
			});
		}

		console.log("[Updater] Checking for updates…");
		const updateInfo = await Updater.checkForUpdate();

		if (updateInfo.error) {
			console.log(`[Updater] Check failed: ${updateInfo.error}`);
			if (!silent) {
				broadcastUpdateStatus({
					status: "error",
					message: "Failed to check for updates",
					error: updateInfo.error,
				});
			}
			return;
		}

		if (!updateInfo.updateAvailable) {
			console.log("[Updater] Already on latest version");
			if (!silent) {
				broadcastUpdateStatus({
					status: "no-update",
					message: "You are running the latest version",
				});
			}
			return;
		}

		// Update available — start downloading
		console.log(`[Updater] Update available: ${updateInfo.version}`);
		broadcastUpdateStatus({
			status: "update-available",
			message: `Update available: v${updateInfo.version}`,
			newVersion: updateInfo.version,
		});

		broadcastUpdateStatus({
			status: "downloading",
			message: "Downloading update…",
			newVersion: updateInfo.version,
		});

		await Updater.downloadUpdate();

		const finalInfo = Updater.updateInfo();
		if (finalInfo?.updateReady) {
			console.log("[Updater] Update downloaded and ready to install");
			broadcastUpdateStatus({
				status: "update-ready",
				message: `Update v${updateInfo.version} is ready — restart to apply`,
				newVersion: updateInfo.version,
			});
		} else {
			console.log("[Updater] Download completed but update not ready");
			broadcastUpdateStatus({
				status: "error",
				message: "Update download failed",
				error: finalInfo?.error || "Download did not produce a ready update",
			});
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Updater] Error:", msg);
		if (!silent) {
			broadcastUpdateStatus({
				status: "error",
				message: "Update check failed",
				error: msg,
			});
		}
	} finally {
		isChecking = false;
	}
}

// ============================================================================
// Apply Update
// ============================================================================

/**
 * Apply a downloaded update.
 *
 * This triggers a graceful quit → app replacement → relaunch.
 * The function does not return — the app will exit during the process.
 */
async function applyUpdate(): Promise<void> {
	const info = Updater.updateInfo();
	if (!info?.updateReady) {
		console.warn("[Updater] No update ready to apply");
		broadcastUpdateStatus({
			status: "error",
			message: "No update ready to install",
			error: "Call checkForUpdates first",
		});
		return;
	}

	console.log("[Updater] Applying update…");
	broadcastUpdateStatus({
		status: "applying",
		message: "Installing update — the app will restart shortly…",
	});

	// Small delay to let the WS push reach the browser
	await Bun.sleep(500);

	// This will quit the app, replace the bundle, and relaunch.
	// Does not return.
	await Updater.applyUpdate();
}

// ============================================================================
// Status Subscription
// ============================================================================

/**
 * Subscribe to Electrobun's granular update status events and
 * forward download progress to the web app.
 */
function wireStatusEvents(): void {
	Updater.onStatusChange((entry) => {
		console.log(`[Updater] ${entry.status}: ${entry.message}`);

		// Forward download progress specifically
		if (entry.status === "download-progress" && entry.details?.progress != null) {
			broadcastUpdateStatus({
				status: "download-progress",
				message: entry.message,
				progress: entry.details.progress,
			});
		}
	});
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the auto-updater.
 *
 * - Registers Electrobun status event listener
 * - Schedules initial check after delay
 * - Starts periodic background checks
 *
 * @param server - PiBun server for WebSocket broadcasting
 */
export function initUpdater(server: PiBunServer): void {
	serverRef = server;

	// Wire Electrobun's granular status events
	wireStatusEvents();

	// Initial check after a short delay (let the app fully start up)
	setTimeout(() => {
		checkForUpdates(true).catch((err: unknown) => {
			console.error("[Updater] Initial check error:", err);
		});
	}, INITIAL_CHECK_DELAY_MS);

	// Periodic checks
	periodicTimer = setInterval(() => {
		checkForUpdates(true).catch((err: unknown) => {
			console.error("[Updater] Periodic check error:", err);
		});
	}, PERIODIC_CHECK_INTERVAL_MS);

	console.log("[Updater] Auto-updater initialized");
}

/**
 * Handle the "Check for Updates…" menu action.
 * Triggers a non-silent check (shows status to user).
 */
export function handleCheckForUpdates(): void {
	checkForUpdates(false).catch((err: unknown) => {
		console.error("[Updater] Manual check error:", err);
	});
}

/**
 * Handle the "Restart to Update" action from the web app.
 */
export function handleApplyUpdate(): void {
	applyUpdate().catch((err: unknown) => {
		console.error("[Updater] Apply error:", err);
	});
}

/**
 * Get the latest update status (for replaying to new connections).
 */
export function getLatestUpdateStatus(): WsAppUpdateData {
	return latestStatus;
}

/**
 * Clean up the updater (stop periodic checks).
 */
export function stopUpdater(): void {
	if (periodicTimer) {
		clearInterval(periodicTimer);
		periodicTimer = null;
	}
	Updater.onStatusChange(null);
	serverRef = null;
	console.log("[Updater] Stopped");
}
