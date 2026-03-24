/**
 * PluginManager — list installed plugins, enable/disable, install from URL/path.
 *
 * Accessible from the toolbar via puzzle-piece icon. Opens a dropdown panel:
 * - Plugin list: name, version, description, panel count, enable/disable toggle, uninstall
 * - Install section: text input for URL or local path, install button
 * - Loading/error states for async operations
 *
 * Follows the same dropdown pattern as ThemeSelector and ExportDialog:
 * click-outside to close, Escape to close, z-50 positioning.
 */

import { fetchPlugins, installPlugin, setPluginEnabled, uninstallPlugin } from "@/lib/appActions";
import { cn, onShortcut } from "@/lib/utils";
import { useStore } from "@/store";
import type { Plugin } from "@pibun/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Plugin Item
// ============================================================================

interface PluginItemProps {
	plugin: Plugin;
	onToggle: (pluginId: string, enabled: boolean) => void;
	onUninstall: (pluginId: string) => void;
	isToggling: string | null;
	isUninstalling: string | null;
}

const PluginItem = memo(function PluginItem({
	plugin,
	onToggle,
	onUninstall,
	isToggling,
	isUninstalling,
}: PluginItemProps) {
	const { manifest, enabled, error } = plugin;
	const isBusy = isToggling === manifest.id || isUninstalling === manifest.id;
	const panelCount = manifest.panels.length;

	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors",
				error
					? "border-status-error/30 bg-status-error/5"
					: enabled
						? "border-border-primary bg-surface-primary"
						: "border-border-muted bg-surface-secondary/50",
			)}
		>
			{/* Top row: name + version + toggle */}
			<div className="flex items-center gap-2">
				{/* Plugin icon — puzzle piece */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn("h-4 w-4 shrink-0", enabled ? "text-accent-primary" : "text-text-muted")}
					aria-label={`Plugin: ${manifest.name}`}
					role="img"
				>
					<path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 0 3h-.5v1H10a2 2 0 0 1 2 2v1.5h1a1.5 1.5 0 0 1 0 3H12V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5V5H5a1.5 1.5 0 0 1-.5-1.5z" />
				</svg>

				{/* Name + version */}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<span className="truncate text-sm font-medium text-text-primary">{manifest.name}</span>
						<span className="shrink-0 text-[10px] text-text-muted">v{manifest.version}</span>
					</div>
				</div>

				{/* Enable/disable toggle */}
				<button
					type="button"
					onClick={() => onToggle(manifest.id, !enabled)}
					disabled={isBusy}
					className={cn(
						"relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
						isBusy && "cursor-wait opacity-60",
						enabled ? "bg-accent-primary" : "bg-surface-tertiary",
					)}
					role="switch"
					aria-checked={enabled}
					aria-label={`${enabled ? "Disable" : "Enable"} ${manifest.name}`}
				>
					<span
						className={cn(
							"inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
							enabled ? "translate-x-[18px]" : "translate-x-[3px]",
						)}
					/>
				</button>
			</div>

			{/* Description */}
			{manifest.description && (
				<p className="text-xs text-text-tertiary leading-relaxed">{manifest.description}</p>
			)}

			{/* Bottom row: metadata + uninstall */}
			<div className="flex items-center gap-2">
				{/* Panel count badge */}
				<span className="text-[10px] text-text-muted">
					{String(panelCount)} panel{panelCount !== 1 ? "s" : ""}
				</span>

				{/* Author */}
				{manifest.author && (
					<>
						<span className="text-[10px] text-text-muted">·</span>
						<span className="text-[10px] text-text-muted">{manifest.author}</span>
					</>
				)}

				{/* Error indicator */}
				{error && (
					<>
						<span className="text-[10px] text-text-muted">·</span>
						<span className="text-[10px] text-status-error" title={error}>
							⚠ Error
						</span>
					</>
				)}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Uninstall button */}
				<button
					type="button"
					onClick={() => onUninstall(manifest.id)}
					disabled={isBusy}
					className={cn(
						"text-[10px] font-medium transition-colors",
						isBusy ? "cursor-wait text-text-muted" : "text-text-tertiary hover:text-status-error",
					)}
				>
					{isUninstalling === manifest.id ? "Removing…" : "Uninstall"}
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// Install Form
// ============================================================================

interface InstallFormProps {
	onInstall: (source: string) => void;
	isInstalling: boolean;
}

const InstallForm = memo(function InstallForm({ onInstall, isInstalling }: InstallFormProps) {
	const [source, setSource] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = useCallback(() => {
		const trimmed = source.trim();
		if (trimmed && !isInstalling) {
			onInstall(trimmed);
			setSource("");
		}
	}, [source, isInstalling, onInstall]);

	return (
		<div className="flex flex-col gap-1.5">
			<label
				htmlFor="plugin-install-source"
				className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary"
			>
				Install Plugin
			</label>
			<div className="flex items-center gap-1.5">
				<input
					ref={inputRef}
					id="plugin-install-source"
					type="text"
					value={source}
					onChange={(e) => setSource(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							handleSubmit();
						}
					}}
					placeholder="/path/to/plugin or https://…"
					disabled={isInstalling}
					className={cn(
						"min-w-0 flex-1 rounded border border-border-primary bg-surface-secondary px-2 py-1.5 text-xs text-text-primary",
						"placeholder-text-muted outline-none focus:border-accent-primary",
						isInstalling && "cursor-wait opacity-60",
					)}
				/>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!source.trim() || isInstalling}
					className={cn(
						"rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
						source.trim() && !isInstalling
							? "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover"
							: "cursor-not-allowed bg-surface-tertiary text-text-tertiary",
					)}
				>
					{isInstalling ? "Installing…" : "Install"}
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// Main Component
// ============================================================================

export function PluginManager() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const plugins = useStore((s) => s.plugins);
	const pluginsLoading = useStore((s) => s.pluginsLoading);
	const addToast = useStore((s) => s.addToast);
	const setLastError = useStore((s) => s.setLastError);

	const [isOpen, setIsOpen] = useState(false);
	const [isInstalling, setIsInstalling] = useState(false);
	const [isToggling, setIsToggling] = useState<string | null>(null);
	const [isUninstalling, setIsUninstalling] = useState<string | null>(null);

	const dropdownRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const isConnected = connectionStatus === "open";

	// Toggle dropdown
	const handleToggle = useCallback(() => {
		if (!isConnected) return;
		setIsOpen((prev) => {
			const next = !prev;
			// Refresh plugin list when opening
			if (next) {
				fetchPlugins().catch((err: unknown) => {
					console.error("[PluginManager] Failed to fetch plugins:", err);
				});
			}
			return next;
		});
	}, [isConnected]);

	// Subscribe to keyboard shortcut (Ctrl+Shift+P)
	useEffect(() => {
		return onShortcut((action) => {
			if (action === "togglePluginManager" && isConnected) {
				setIsOpen((prev) => {
					const next = !prev;
					if (next) {
						fetchPlugins().catch((err: unknown) => {
							console.error("[PluginManager] Failed to fetch plugins:", err);
						});
					}
					return next;
				});
			}
		});
	}, [isConnected]);

	// Install plugin
	const handleInstall = useCallback(
		async (source: string) => {
			setIsInstalling(true);
			try {
				await installPlugin(source);
				addToast("Plugin installed", "info");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setLastError(`Plugin install failed: ${msg}`);
			} finally {
				setIsInstalling(false);
			}
		},
		[addToast, setLastError],
	);

	// Toggle enabled/disabled
	const handleToggleEnabled = useCallback(
		async (pluginId: string, enabled: boolean) => {
			setIsToggling(pluginId);
			try {
				await setPluginEnabled(pluginId, enabled);
				addToast(`Plugin ${enabled ? "enabled" : "disabled"}`, "info");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setLastError(`Failed to ${enabled ? "enable" : "disable"} plugin: ${msg}`);
			} finally {
				setIsToggling(null);
			}
		},
		[addToast, setLastError],
	);

	// Uninstall plugin
	const handleUninstall = useCallback(
		async (pluginId: string) => {
			setIsUninstalling(pluginId);
			try {
				await uninstallPlugin(pluginId);
				addToast("Plugin uninstalled", "info");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setLastError(`Plugin uninstall failed: ${msg}`);
			} finally {
				setIsUninstalling(null);
			}
		},
		[addToast, setLastError],
	);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
				triggerRef.current?.focus();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// Close on click outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(target) &&
				triggerRef.current &&
				!triggerRef.current.contains(target)
			) {
				setIsOpen(false);
			}
		};

		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	const enabledCount = plugins.filter((p) => p.enabled).length;

	return (
		<div className="relative">
			{/* Trigger button */}
			<button
				ref={triggerRef}
				type="button"
				onClick={handleToggle}
				disabled={!isConnected}
				title="Manage plugins (Ctrl+Shift+P)"
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
					!isConnected
						? "cursor-not-allowed text-text-muted"
						: isOpen
							? "bg-surface-secondary text-text-primary"
							: "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
				)}
			>
				{/* Puzzle piece icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="Plugins"
					role="img"
				>
					<path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 0 3h-.5v1H10a2 2 0 0 1 2 2v1.5h1a1.5 1.5 0 0 1 0 3H12V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5V5H5a1.5 1.5 0 0 1-.5-1.5z" />
				</svg>
				Plugins
				{enabledCount > 0 && (
					<span className="rounded-full bg-accent-primary/20 px-1.5 py-0.5 text-[10px] leading-none text-accent-text">
						{String(enabledCount)}
					</span>
				)}
			</button>

			{/* Dropdown panel */}
			{isOpen && (
				<div
					ref={dropdownRef}
					className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border-primary bg-surface-primary shadow-xl"
				>
					{/* Header */}
					<div className="flex items-center justify-between border-b border-border-secondary px-3 py-2">
						<div>
							<p className="text-xs font-medium text-text-secondary">Plugins</p>
							<p className="mt-0.5 text-[10px] text-text-tertiary">
								{plugins.length === 0
									? "No plugins installed"
									: `${String(plugins.length)} installed · ${String(enabledCount)} active`}
							</p>
						</div>
						{/* Refresh button */}
						<button
							type="button"
							onClick={() => {
								fetchPlugins().catch((err: unknown) => {
									console.error("[PluginManager] Refresh failed:", err);
								});
							}}
							disabled={pluginsLoading}
							className={cn(
								"rounded p-1 transition-colors",
								pluginsLoading
									? "animate-spin text-text-tertiary"
									: "text-text-muted hover:text-text-secondary",
							)}
							aria-label="Refresh plugins"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-3.5 w-3.5"
								aria-label="Refresh"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37A5.508 5.508 0 0 0 8 3.5a5.5 5.5 0 1 0 5.215 3.772.75.75 0 1 1 1.423-.474A7 7 0 1 1 12.12 3.16l1.716.005z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</div>

					{/* Plugin list */}
					<div className="max-h-64 overflow-y-auto">
						{pluginsLoading && plugins.length === 0 ? (
							<div className="flex items-center justify-center py-6">
								<div className="flex items-center gap-2 text-xs text-text-tertiary">
									<div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
									Loading plugins…
								</div>
							</div>
						) : plugins.length === 0 ? (
							<div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="currentColor"
									className="h-6 w-6 text-text-muted"
									aria-label="No plugins"
									role="img"
								>
									<path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 0 3h-.5v1H10a2 2 0 0 1 2 2v1.5h1a1.5 1.5 0 0 1 0 3H12V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5V5H5a1.5 1.5 0 0 1-.5-1.5z" />
								</svg>
								<p className="text-xs text-text-tertiary">No plugins installed yet.</p>
								<p className="text-[10px] text-text-muted">Install one using the form below.</p>
							</div>
						) : (
							<div className="flex flex-col gap-2 p-2">
								{plugins.map((plugin) => (
									<PluginItem
										key={plugin.manifest.id}
										plugin={plugin}
										onToggle={handleToggleEnabled}
										onUninstall={handleUninstall}
										isToggling={isToggling}
										isUninstalling={isUninstalling}
									/>
								))}
							</div>
						)}
					</div>

					{/* Install section */}
					<div className="border-t border-border-secondary px-3 py-2.5">
						<InstallForm onInstall={handleInstall} isInstalling={isInstalling} />
					</div>
				</div>
			)}
		</div>
	);
}
