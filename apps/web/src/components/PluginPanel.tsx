/**
 * PluginPanel — renders a plugin's content in a sandboxed iframe.
 *
 * Each enabled plugin panel gets its own PluginPanel instance.
 * The iframe is sandboxed with restricted permissions and communicates
 * with PiBun via the `postMessage` bridge (implemented in 7.5).
 *
 * Panel positions:
 * - "sidebar": renders in the sidebar, below other sections
 * - "bottom": renders below the chat, alongside the terminal pane
 * - "right": renders as a right panel adjacent to the main area
 */

import { resolvePluginComponentUrl } from "@/lib/appActions";
import { registerPluginFrame, unregisterPluginFrame } from "@/lib/pluginMessageBridge";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { ActivePluginPanel } from "@/store/types";
import type { Plugin, PluginPanelPosition } from "@pibun/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// Helper — pure function for deriving active panels (used with useMemo)
// ============================================================================

function getActivePanelsByPosition(
	plugins: Plugin[],
	activePanels: Set<string>,
	position: PluginPanelPosition,
): ActivePluginPanel[] {
	const result: ActivePluginPanel[] = [];
	for (const plugin of plugins) {
		if (!plugin.enabled || plugin.error) continue;
		for (const panel of plugin.manifest.panels) {
			if (panel.position !== position) continue;
			const panelKey = `${plugin.manifest.id}:${panel.id}`;
			if (activePanels.has(panelKey)) {
				result.push({
					pluginId: plugin.manifest.id,
					panelId: panel.id,
					title: panel.title,
					icon: panel.icon,
					component: panel.component,
					defaultSize: panel.defaultSize,
				});
			}
		}
	}
	return result;
}

// ============================================================================
// Plugin Panel Frame
// ============================================================================

interface PluginPanelFrameProps {
	panel: ActivePluginPanel;
	className?: string;
}

/**
 * Single plugin panel — sandboxed iframe loading the plugin's content URL.
 *
 * Sandbox allows:
 * - `allow-scripts`: plugin JS can run
 * - `allow-same-origin`: needed for postMessage origin checks
 * - `allow-forms`: plugin can submit forms (e.g., search fields)
 *
 * Denied:
 * - `allow-popups`: no popup windows
 * - `allow-top-navigation`: can't navigate the parent page
 * - `allow-modals`: can't show alert/confirm/prompt
 */
const PluginPanelFrame = memo(function PluginPanelFrame({
	panel,
	className,
}: PluginPanelFrameProps) {
	const src = resolvePluginComponentUrl(panel.pluginId, panel.component);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);

	const panelKey = `${panel.pluginId}:${panel.panelId}`;

	// Register/unregister the iframe with the plugin message bridge.
	// Once loaded, the iframe can communicate via postMessage.
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe || hasError) return;

		registerPluginFrame(panelKey, iframe, panel.pluginId);
		return () => {
			unregisterPluginFrame(panelKey);
		};
	}, [panelKey, panel.pluginId, hasError]);

	const handleLoad = useCallback(() => {
		setIsLoading(false);
	}, []);

	const handleError = useCallback(() => {
		setIsLoading(false);
		setHasError(true);
	}, []);

	return (
		<div className={cn("flex flex-col overflow-hidden", className)}>
			{/* Panel header */}
			<div className="flex items-center gap-2 border-b border-border-secondary bg-surface-secondary px-3 py-1.5">
				{/* Puzzle piece icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5 text-text-tertiary"
					aria-label={`Plugin: ${panel.title}`}
					role="img"
				>
					<path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 0 3h-.5v1H10a2 2 0 0 1 2 2v1.5h1a1.5 1.5 0 0 1 0 3H12V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5V5H5a1.5 1.5 0 0 1-.5-1.5z" />
				</svg>
				<span className="text-xs font-medium text-text-secondary">{panel.title}</span>
			</div>

			{/* Loading indicator */}
			{isLoading && (
				<div className="flex flex-1 items-center justify-center bg-surface-base">
					<div className="flex items-center gap-2 text-xs text-text-tertiary">
						<div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
						Loading plugin…
					</div>
				</div>
			)}

			{/* Error state */}
			{hasError && (
				<div className="flex flex-1 items-center justify-center bg-surface-base p-4">
					<div className="text-center text-xs text-status-error">
						<p className="font-medium">Failed to load plugin</p>
						<p className="mt-1 text-text-tertiary">
							{panel.pluginId}/{panel.panelId}
						</p>
					</div>
				</div>
			)}

			{/* Sandboxed iframe */}
			<iframe
				ref={iframeRef}
				src={src}
				title={`Plugin: ${panel.title}`}
				sandbox="allow-scripts allow-same-origin allow-forms"
				className={cn("flex-1 border-0", isLoading && "hidden", hasError && "hidden")}
				onLoad={handleLoad}
				onError={handleError}
			/>
		</div>
	);
});

// ============================================================================
// Position-specific Containers
// ============================================================================

/**
 * Renders all active plugin panels for the "bottom" position.
 * Similar to TerminalPane — appears below the chat area.
 */
export function PluginBottomPanels() {
	const plugins = useStore((s) => s.plugins);
	const activePluginPanels = useStore((s) => s.activePluginPanels);
	const panels = useMemo(
		() => getActivePanelsByPosition(plugins, activePluginPanels, "bottom"),
		[plugins, activePluginPanels],
	);

	if (panels.length === 0) return null;

	return (
		<div className="border-t border-border-secondary">
			{panels.map((panel) => (
				<PluginPanelFrame
					key={`${panel.pluginId}:${panel.panelId}`}
					panel={panel}
					className={cn(
						"min-h-[150px]",
						panel.defaultSize ? `h-[${String(panel.defaultSize)}px]` : "h-[200px]",
					)}
				/>
			))}
		</div>
	);
}

/**
 * Renders all active plugin panels for the "sidebar" position.
 * Appears in the sidebar, below projects and past sessions.
 */
export function PluginSidebarPanels() {
	const plugins = useStore((s) => s.plugins);
	const activePluginPanels = useStore((s) => s.activePluginPanels);
	const panels = useMemo(
		() => getActivePanelsByPosition(plugins, activePluginPanels, "sidebar"),
		[plugins, activePluginPanels],
	);

	if (panels.length === 0) return null;

	return (
		<div className="flex flex-col">
			{panels.map((panel) => (
				<PluginPanelFrame
					key={`${panel.pluginId}:${panel.panelId}`}
					panel={panel}
					className="h-[250px]"
				/>
			))}
		</div>
	);
}

/**
 * Renders all active plugin panels for the "right" position.
 * Appears as a right panel adjacent to the main area.
 */
export function PluginRightPanels() {
	const plugins = useStore((s) => s.plugins);
	const activePluginPanels = useStore((s) => s.activePluginPanels);
	const panels = useMemo(
		() => getActivePanelsByPosition(plugins, activePluginPanels, "right"),
		[plugins, activePluginPanels],
	);

	if (panels.length === 0) return null;

	return (
		<div className="flex flex-col border-l border-border-secondary">
			{panels.map((panel) => (
				<PluginPanelFrame
					key={`${panel.pluginId}:${panel.panelId}`}
					panel={panel}
					className={cn(
						"flex-1 min-h-0",
						panel.defaultSize ? `w-[${String(panel.defaultSize)}px]` : "w-[300px]",
					)}
				/>
			))}
		</div>
	);
}

export { PluginPanelFrame };
