/**
 * Plugin Message Bridge — postMessage communication between PiBun and plugin iframes.
 *
 * Plugins communicate with PiBun via the `postMessage` API:
 * - Plugin → PiBun: `window.parent.postMessage({ type: "plugin:...", ... }, "*")`
 * - PiBun → Plugin: `iframe.contentWindow.postMessage({ type: "pibun:...", ... }, origin)`
 *
 * The bridge validates incoming messages, routes them to handlers, and tracks
 * per-plugin event subscriptions for forwarding Pi events.
 *
 * @module
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { PiBunToPluginMessage, PiEvent, PluginToPiBunMessage } from "@pibun/contracts";

// ============================================================================
// Plugin Frame Registry
// ============================================================================

/** Registered plugin iframe entry. */
interface PluginFrameEntry {
	/** The iframe element (for accessing contentWindow). */
	iframe: HTMLIFrameElement;
	/** The plugin ID (for logging and validation). */
	pluginId: string;
	/** The panel key (`{pluginId}:{panelId}`). */
	panelKey: string;
	/**
	 * Event types this plugin has subscribed to.
	 * Empty array means "subscribe to all events".
	 * Null means "not subscribed".
	 */
	eventSubscriptions: string[] | null;
}

/**
 * Registry of active plugin iframes.
 * Key: panelKey (`{pluginId}:{panelId}`)
 */
const registry = new Map<string, PluginFrameEntry>();

// ============================================================================
// Registration
// ============================================================================

/**
 * Register a plugin iframe with the bridge.
 *
 * Called by `PluginPanelFrame` when its iframe mounts.
 * The iframe is tracked for outbound messages and event forwarding.
 */
export function registerPluginFrame(
	panelKey: string,
	iframe: HTMLIFrameElement,
	pluginId: string,
): void {
	registry.set(panelKey, {
		iframe,
		pluginId,
		panelKey,
		eventSubscriptions: null,
	});
}

/**
 * Unregister a plugin iframe from the bridge.
 *
 * Called by `PluginPanelFrame` when its iframe unmounts.
 * Removes the entry and clears any event subscriptions.
 */
export function unregisterPluginFrame(panelKey: string): void {
	registry.delete(panelKey);
}

// ============================================================================
// Outbound Messaging
// ============================================================================

/**
 * Send a message to a specific plugin iframe.
 *
 * Uses `"*"` as the target origin because plugin content is served from
 * our own server (same origin) or an external URL. The sandboxed iframe
 * can only communicate via postMessage anyway.
 */
export function sendToPlugin(panelKey: string, message: PiBunToPluginMessage): void {
	const entry = registry.get(panelKey);
	if (!entry) return;

	try {
		entry.iframe.contentWindow?.postMessage(message, "*");
	} catch (err) {
		console.warn(`[PluginBridge] Failed to send message to ${panelKey}:`, err);
	}
}

/**
 * Broadcast a message to all registered plugin iframes.
 *
 * Used for global notifications (theme changes, etc.).
 */
export function broadcastToPlugins(message: PiBunToPluginMessage): void {
	for (const [panelKey] of registry) {
		sendToPlugin(panelKey, message);
	}
}

// ============================================================================
// Pi Event Forwarding
// ============================================================================

/**
 * Forward a Pi event to all subscribed plugin iframes.
 *
 * Called from `wireTransport.ts` whenever a Pi event is dispatched.
 * Only forwards to plugins that have called `plugin:subscribeEvents`.
 * Plugins subscribed with an empty `eventTypes` array receive all events.
 */
export function forwardPiEventToPlugins(event: PiEvent): void {
	for (const [panelKey, entry] of registry) {
		if (entry.eventSubscriptions === null) continue;

		// Empty array = subscribe to all events
		if (entry.eventSubscriptions.length === 0 || entry.eventSubscriptions.includes(event.type)) {
			sendToPlugin(panelKey, {
				type: "pibun:event",
				eventType: event.type,
				data: event,
			});
		}
	}
}

// ============================================================================
// Inbound Message Handling
// ============================================================================

/**
 * Find the registry entry for a message event source.
 *
 * Matches the event's `source` (the iframe contentWindow) against registered
 * iframes. Returns the entry or null if no match.
 */
function findEntryBySource(source: MessageEventSource | null): PluginFrameEntry | null {
	if (!source) return null;
	for (const entry of registry.values()) {
		if (entry.iframe.contentWindow === source) {
			return entry;
		}
	}
	return null;
}

/**
 * Validate that a message looks like a plugin message.
 * Must have a `type` string starting with `"plugin:"`.
 */
function isPluginMessage(data: unknown): data is PluginToPiBunMessage {
	return (
		typeof data === "object" &&
		data !== null &&
		"type" in data &&
		typeof (data as Record<string, unknown>).type === "string" &&
		((data as Record<string, unknown>).type as string).startsWith("plugin:")
	);
}

/**
 * Handle an incoming `postMessage` from a plugin iframe.
 *
 * Routes to the appropriate handler based on message type.
 */
function handlePluginMessage(event: MessageEvent): void {
	const data = event.data as unknown;
	if (!isPluginMessage(data)) return;

	const entry = findEntryBySource(event.source);

	switch (data.type) {
		case "plugin:ready":
			handlePluginReady(data.pluginId, entry);
			break;

		case "plugin:getSessionState":
			handleGetSessionState(data.requestId, entry);
			break;

		case "plugin:sendPrompt":
			handleSendPrompt(data.message, data.sendImmediately);
			break;

		case "plugin:subscribeEvents":
			handleSubscribeEvents(data.eventTypes, entry);
			break;

		case "plugin:unsubscribeEvents":
			handleUnsubscribeEvents(entry);
			break;
	}
}

// ── Individual Handlers ────────────────────────────────────────────────────

/**
 * Handle `plugin:ready` — plugin iframe has loaded and is ready.
 *
 * Logs the registration and sends the current theme so the plugin
 * can style itself to match the PiBun app.
 */
function handlePluginReady(pluginId: string, entry: PluginFrameEntry | null): void {
	console.log(`[PluginBridge] Plugin ready: ${pluginId}`);

	if (!entry) {
		console.warn(
			`[PluginBridge] Received plugin:ready from unregistered iframe (pluginId: ${pluginId})`,
		);
		return;
	}

	// Send current theme to the newly ready plugin
	const themeId = document.documentElement.getAttribute("data-theme") ?? "dark";
	const isDark = !themeId.includes("light");
	sendToPlugin(entry.panelKey, {
		type: "pibun:themeChanged",
		themeId,
		isDark,
	});
}

/**
 * Handle `plugin:getSessionState` — plugin requests current session info.
 *
 * Reads the current session state from Zustand and responds with a
 * `pibun:sessionState` message.
 */
function handleGetSessionState(requestId: string, entry: PluginFrameEntry | null): void {
	if (!entry) return;

	const store = useStore.getState();
	sendToPlugin(entry.panelKey, {
		type: "pibun:sessionState",
		requestId,
		sessionId: store.sessionId,
		model: store.model?.id ?? null,
		isStreaming: store.isStreaming,
		cwd: null, // CWD not currently stored in session slice — could be added later
	});
}

/**
 * Handle `plugin:sendPrompt` — plugin wants to send or insert a prompt.
 *
 * Two modes:
 * - `sendImmediately: true` → send via `session.prompt` transport method
 * - `sendImmediately: false` → insert text into the Composer via `pendingComposerText`
 */
function handleSendPrompt(message: string, sendImmediately: boolean): void {
	if (sendImmediately) {
		// Send directly via transport
		const store = useStore.getState();
		if (!store.sessionId) {
			console.warn("[PluginBridge] Cannot send prompt — no active session");
			return;
		}

		getTransport()
			.request("session.prompt", { message })
			.catch((err: unknown) => {
				console.error("[PluginBridge] Failed to send prompt:", err);
			});
	} else {
		// Insert into Composer for user review
		useStore.getState().setPendingComposerText(message);
	}
}

/**
 * Handle `plugin:subscribeEvents` — plugin wants to receive Pi events.
 *
 * If `eventTypes` is empty, subscribes to ALL Pi events.
 * Otherwise, only events matching the specified types are forwarded.
 */
function handleSubscribeEvents(eventTypes: string[], entry: PluginFrameEntry | null): void {
	if (!entry) return;
	entry.eventSubscriptions = eventTypes;
	console.log(
		`[PluginBridge] ${entry.pluginId} subscribed to events:`,
		eventTypes.length === 0 ? "all" : eventTypes,
	);
}

/**
 * Handle `plugin:unsubscribeEvents` — plugin no longer wants Pi events.
 */
function handleUnsubscribeEvents(entry: PluginFrameEntry | null): void {
	if (!entry) return;
	entry.eventSubscriptions = null;
	console.log(`[PluginBridge] ${entry.pluginId} unsubscribed from events`);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the plugin message bridge.
 *
 * Sets up a global `message` event listener to receive postMessage events
 * from plugin iframes. Returns a cleanup function that removes the listener
 * and clears the registry.
 *
 * Call once at app startup (from `initTransport()`).
 */
export function initPluginMessageBridge(): () => void {
	window.addEventListener("message", handlePluginMessage);

	return () => {
		window.removeEventListener("message", handlePluginMessage);
		registry.clear();
	};
}
