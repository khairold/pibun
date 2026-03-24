/**
 * ModelSelector — dropdown to pick an LLM model.
 *
 * Shows the current model name as a trigger button. On click, opens a
 * dropdown panel listing all available models grouped by provider.
 * Selecting a model calls `session.setModel` to switch.
 *
 * Models are fetched via `session.getModels` when the dropdown first opens.
 * Subsequent opens use the cached list (re-fetch via a refresh button).
 */

import { cn } from "@/lib/cn";
import { onShortcut } from "@/lib/shortcuts";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { PiModel } from "@pibun/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Group models by provider name. */
function groupByProvider(models: readonly PiModel[]): Map<string, PiModel[]> {
	const groups = new Map<string, PiModel[]>();
	for (const model of models) {
		const provider = model.provider || "unknown";
		let group = groups.get(provider);
		if (!group) {
			group = [];
			groups.set(provider, group);
		}
		group.push(model);
	}
	return groups;
}

/** Format a short display name for a model. */
function displayName(model: PiModel): string {
	return model.name || model.id;
}

/** Format provider name for display (capitalize first letter). */
function providerLabel(provider: string): string {
	if (provider.length === 0) return "Unknown";
	return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Extract a user-friendly error message. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

export function ModelSelector() {
	const currentModel = useStore((s) => s.model);
	const sessionId = useStore((s) => s.sessionId);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const availableModels = useStore((s) => s.availableModels);
	const modelsLoading = useStore((s) => s.modelsLoading);
	const setAvailableModels = useStore((s) => s.setAvailableModels);
	const setModelsLoading = useStore((s) => s.setModelsLoading);
	const setModel = useStore((s) => s.setModel);
	const setLastError = useStore((s) => s.setLastError);

	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;

	// ── Fetch models ──────────────────────────────────────────────────
	const fetchModels = useCallback(async () => {
		if (!hasSession || modelsLoading) return;
		setModelsLoading(true);
		try {
			const result = await getTransport().request("session.getModels");
			setAvailableModels(result.models);
		} catch (err) {
			console.error("[ModelSelector] Failed to fetch models:", err);
			setLastError(`Failed to fetch models: ${errorMessage(err)}`);
		} finally {
			setModelsLoading(false);
		}
	}, [hasSession, modelsLoading, setAvailableModels, setModelsLoading, setLastError]);

	// Fetch on first open if not already loaded
	const handleToggle = useCallback(() => {
		const opening = !isOpen;
		setIsOpen(opening);
		if (opening && availableModels.length === 0 && hasSession) {
			fetchModels();
		}
	}, [isOpen, availableModels.length, hasSession, fetchModels]);

	// ── Select a model ────────────────────────────────────────────────
	const handleSelect = useCallback(
		async (model: PiModel) => {
			setIsOpen(false);
			if (!hasSession) return;

			// Optimistically update the store
			setModel(model);
			try {
				await getTransport().request("session.setModel", {
					provider: model.provider,
					modelId: model.id,
				});
			} catch (err) {
				console.error("[ModelSelector] Failed to set model:", err);
				setLastError(`Failed to switch model: ${errorMessage(err)}`);
				// Revert optimistic update
				setModel(currentModel);
			}
		},
		[hasSession, currentModel, setModel, setLastError],
	);

	// ── Click-outside to close ────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(target) &&
				triggerRef.current &&
				!triggerRef.current.contains(target)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	// ── Escape to close ───────────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setIsOpen(false);
				triggerRef.current?.focus();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// ── Keyboard shortcut to toggle ───────────────────────────────────
	useEffect(() => {
		return onShortcut((action) => {
			if (action === "toggleModelSelector") {
				setIsOpen((prev) => !prev);
			}
		});
	}, []);

	// ── Group models by provider ──────────────────────────────────────
	const grouped = useMemo(() => groupByProvider(availableModels), [availableModels]);

	// ── Trigger label ─────────────────────────────────────────────────
	const triggerLabel = currentModel ? displayName(currentModel) : "No model";

	return (
		<div className="relative">
			{/* Trigger button */}
			<button
				ref={triggerRef}
				type="button"
				onClick={handleToggle}
				disabled={!isConnected || !hasSession}
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
					"border border-border-primary bg-surface-primary transition-colors",
					isConnected && hasSession
						? "text-text-primary hover:border-text-tertiary hover:bg-surface-secondary"
						: "cursor-not-allowed text-text-muted",
					isOpen && "border-text-tertiary bg-surface-secondary",
				)}
				title="Switch model (Ctrl+L)"
			>
				{/* Model icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5 shrink-0"
					aria-label="Model"
					role="img"
				>
					<path d="M8 1a.5.5 0 0 1 .424.235l2.5 4a.5.5 0 0 1-.025.526l-2.5 3.5a.5.5 0 0 1-.798 0l-2.5-3.5a.5.5 0 0 1-.025-.526l2.5-4A.5.5 0 0 1 8 1zM6.28 5.5 8 2.752 9.72 5.5l-1.72 2.408L6.28 5.5z" />
					<path d="M2.5 10a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-3zm1 .5v2h9v-2h-9z" />
				</svg>

				<span className="max-w-[180px] truncate">{triggerLabel}</span>

				{/* Chevron */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-180")}
					aria-label="Toggle model list"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"
						clipRule="evenodd"
					/>
				</svg>
			</button>

			{/* Dropdown panel */}
			{isOpen && (
				<div
					ref={dropdownRef}
					className={cn(
						"absolute left-0 top-full z-50 mt-1 w-80",
						"rounded-lg border border-border-primary bg-surface-primary shadow-xl",
						"max-h-[400px] overflow-y-auto",
					)}
				>
					{/* Header with refresh */}
					<div className="flex items-center justify-between border-b border-border-secondary px-3 py-2">
						<span className="text-xs font-medium text-text-secondary">Available Models</span>
						<button
							type="button"
							onClick={fetchModels}
							disabled={modelsLoading}
							className={cn(
								"rounded p-1 text-text-tertiary transition-colors hover:text-text-secondary",
								modelsLoading && "animate-spin",
							)}
							title="Refresh models"
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
									d="M3.083 5.802a5 5 0 0 1 8.92-.798.75.75 0 1 0 1.37-.61 6.5 6.5 0 0 0-11.595 1.036L1 4.75V7.5h2.75L3.083 5.802zM12.917 10.198a5 5 0 0 1-8.92.798.75.75 0 0 0-1.37.61 6.5 6.5 0 0 0 11.595-1.036L15 11.25V8.5h-2.75l.667 1.698z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</div>

					{/* Loading state */}
					{modelsLoading && availableModels.length === 0 && (
						<div className="flex items-center justify-center py-8">
							<span className="text-xs text-text-tertiary">Loading models…</span>
						</div>
					)}

					{/* Empty state */}
					{!modelsLoading && availableModels.length === 0 && (
						<div className="flex items-center justify-center py-8">
							<span className="text-xs text-text-tertiary">No models available</span>
						</div>
					)}

					{/* Grouped model list */}
					{availableModels.length > 0 && (
						<div className="py-1">
							{[...grouped.entries()].map(([provider, models]) => (
								<div key={provider}>
									{/* Provider header */}
									<div className="px-3 pb-1 pt-2">
										<span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
											{providerLabel(provider)}
										</span>
									</div>
									{/* Model items */}
									{models.map((model) => {
										const isActive =
											currentModel?.id === model.id && currentModel?.provider === model.provider;
										return (
											<button
												key={`${model.provider}-${model.id}`}
												type="button"
												onClick={() => handleSelect(model)}
												className={cn(
													"flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
													isActive
														? "bg-accent-soft text-accent-text"
														: "text-text-secondary hover:bg-surface-secondary",
												)}
											>
												{/* Active indicator */}
												<span
													className={cn(
														"h-1.5 w-1.5 shrink-0 rounded-full",
														isActive ? "bg-accent-text" : "bg-transparent",
													)}
												/>

												{/* Model info */}
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-1.5">
														<span className="truncate text-xs font-medium">
															{displayName(model)}
														</span>
														{model.reasoning && (
															<span className="shrink-0 rounded bg-status-warning-bg px-1 py-0.5 text-[9px] font-medium text-status-warning-text">
																reasoning
															</span>
														)}
														{model.input.includes("image") && (
															<span className="shrink-0 rounded bg-status-success-bg px-1 py-0.5 text-[9px] font-medium text-status-success-text">
																vision
															</span>
														)}
													</div>
													<div className="mt-0.5 text-[10px] text-text-tertiary">
														{model.id}
														{model.contextWindow > 0 && (
															<>
																{" · "}
																{Math.round(model.contextWindow / 1000)}k ctx
															</>
														)}
													</div>
												</div>
											</button>
										);
									})}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
