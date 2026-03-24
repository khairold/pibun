/**
 * SessionStats — compact display of token usage and cost.
 *
 * Shows total tokens and cumulative cost in the toolbar.
 * Stats are fetched after each agent turn (agent_end event)
 * via wireTransport → fetchSessionStats.
 *
 * Clicking opens a detailed tooltip with input/output/cache breakdown.
 */

import { fetchSessionStats } from "@/lib/sessionActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { PiSessionStats } from "@pibun/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

/** Format a token count for compact display (e.g., 1.2k, 45.3k, 1.2M). */
function formatTokens(count: number): string {
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Format a cost value (e.g., $0.00, $0.12, $1.23). */
function formatCost(cost: number): string {
	if (cost === 0) return "$0.00";
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	if (cost < 1) return `$${cost.toFixed(2)}`;
	return `$${cost.toFixed(2)}`;
}

/** Format a detailed token row for the expanded view. */
function TokenRow({ label, count }: { label: string; count: number }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-text-tertiary">{label}</span>
			<span className="tabular-nums text-text-secondary">{formatTokens(count)}</span>
		</div>
	);
}

/** Expanded stats detail panel. */
function StatsDetail({ stats }: { stats: PiSessionStats }) {
	return (
		<div className="space-y-3 p-3">
			{/* Token breakdown */}
			<div>
				<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
					Tokens
				</div>
				<div className="space-y-1 text-xs">
					<TokenRow label="Input" count={stats.tokens.input} />
					<TokenRow label="Output" count={stats.tokens.output} />
					<TokenRow label="Cache read" count={stats.tokens.cacheRead} />
					<TokenRow label="Cache write" count={stats.tokens.cacheWrite} />
					<div className="flex items-center justify-between gap-4 border-t border-border-secondary pt-1 font-medium">
						<span className="text-text-secondary">Total</span>
						<span className="tabular-nums text-text-primary">
							{formatTokens(stats.tokens.total)}
						</span>
					</div>
				</div>
			</div>

			{/* Messages breakdown */}
			<div>
				<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
					Messages
				</div>
				<div className="space-y-1 text-xs">
					<div className="flex items-center justify-between gap-4">
						<span className="text-text-tertiary">User</span>
						<span className="tabular-nums text-text-secondary">{stats.userMessages}</span>
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-text-tertiary">Assistant</span>
						<span className="tabular-nums text-text-secondary">{stats.assistantMessages}</span>
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-text-tertiary">Tool calls</span>
						<span className="tabular-nums text-text-secondary">{stats.toolCalls}</span>
					</div>
					<div className="flex items-center justify-between gap-4 border-t border-border-secondary pt-1 font-medium">
						<span className="text-text-secondary">Total</span>
						<span className="tabular-nums text-text-primary">{stats.totalMessages}</span>
					</div>
				</div>
			</div>

			{/* Cost */}
			<div>
				<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
					Cost
				</div>
				<div className="text-sm font-medium tabular-nums text-text-primary">
					{formatCost(stats.cost)}
				</div>
			</div>
		</div>
	);
}

export function SessionStats() {
	const stats = useStore((s) => s.stats);
	const sessionId = useStore((s) => s.sessionId);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const isStreaming = useStore((s) => s.isStreaming);

	const [isOpen, setIsOpen] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;

	// ── Toggle panel ──────────────────────────────────────────────────
	const handleToggle = useCallback(() => {
		setIsOpen((prev) => !prev);
	}, []);

	// ── Refresh stats on demand ───────────────────────────────────────
	const handleRefresh = useCallback(async () => {
		if (isRefreshing) return;
		setIsRefreshing(true);
		try {
			await fetchSessionStats();
		} finally {
			setIsRefreshing(false);
		}
	}, [isRefreshing]);

	// ── Click-outside to close ────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (
				panelRef.current &&
				!panelRef.current.contains(target) &&
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

	// Don't render if no session or not connected
	if (!isConnected || !hasSession) return null;

	// No stats yet — show nothing (stats will appear after first agent turn)
	if (!stats) return null;

	return (
		<div className="relative">
			{/* Compact trigger — tokens + cost */}
			<button
				ref={triggerRef}
				type="button"
				onClick={handleToggle}
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] tabular-nums transition-colors",
					"text-text-tertiary hover:bg-surface-secondary hover:text-text-secondary",
					isOpen && "bg-surface-secondary text-text-secondary",
					isStreaming && "animate-pulse",
				)}
				title="Session stats"
			>
				{/* Token icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3 shrink-0"
					aria-label="Token usage"
					role="img"
				>
					<path d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm7-5.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM7.25 4.5a.75.75 0 0 1 1.5 0V5h.5a.75.75 0 0 1 0 1.5H7.5a.5.5 0 0 0 0 1h1a2 2 0 1 1 0 4h-.25v.5a.75.75 0 0 1-1.5 0V11.5h-.5a.75.75 0 0 1 0-1.5h1.75a.5.5 0 0 0 0-1h-1a2 2 0 1 1 0-4h.25v-.5z" />
				</svg>
				<span>{formatTokens(stats.tokens.total)}</span>
				<span className="text-text-muted">·</span>
				<span>{formatCost(stats.cost)}</span>
			</button>

			{/* Expanded detail panel */}
			{isOpen && (
				<div
					ref={panelRef}
					className={cn(
						"absolute right-0 top-full z-50 mt-1 w-56",
						"rounded-lg border border-border-primary bg-surface-primary shadow-xl",
					)}
				>
					{/* Header with refresh */}
					<div className="flex items-center justify-between border-b border-border-secondary px-3 py-2">
						<span className="text-xs font-medium text-text-secondary">Session Stats</span>
						<button
							type="button"
							onClick={handleRefresh}
							disabled={isRefreshing}
							className={cn(
								"rounded p-1 text-text-tertiary transition-colors hover:text-text-secondary",
								isRefreshing && "animate-spin",
							)}
							title="Refresh stats"
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

					<StatsDetail stats={stats} />
				</div>
			)}
		</div>
	);
}
