/**
 * Shortcut event bus — lightweight pub/sub for keyboard shortcut actions.
 *
 * The `useKeyboardShortcuts` hook emits actions here.
 * Components subscribe to react to specific shortcuts
 * (e.g., ModelSelector toggles on "toggleModelSelector").
 */

export type ShortcutAction = "abort" | "toggleModelSelector" | "newSession";

type ShortcutListener = (action: ShortcutAction) => void;

const listeners = new Set<ShortcutListener>();

/** Emit a shortcut action to all subscribers. */
export function emitShortcut(action: ShortcutAction): void {
	for (const listener of listeners) {
		listener(action);
	}
}

/** Subscribe to shortcut actions. Returns an unsubscribe function. */
export function onShortcut(handler: ShortcutListener): () => void {
	listeners.add(handler);
	return () => {
		listeners.delete(handler);
	};
}
