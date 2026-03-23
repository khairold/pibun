/**
 * AppShell — top-level layout: sidebar (left) + main area (right).
 *
 * Main area is a flex column: toolbar (model/thinking selectors) +
 * chat messages (scrollable) + composer (fixed bottom).
 * Sidebar is a placeholder for now (Phase 1D.17).
 */

import { ChatView } from "@/components/ChatView";
import { Composer } from "@/components/Composer";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ModelSelector } from "@/components/ModelSelector";
import { ThinkingSelector } from "@/components/ThinkingSelector";

export function AppShell() {
	return (
		<div className="flex h-screen bg-neutral-950 text-neutral-100">
			{/* Sidebar placeholder */}
			<aside className="hidden w-64 shrink-0 border-r border-neutral-800 bg-neutral-900 md:flex md:flex-col">
				<div className="border-b border-neutral-800 px-4 py-3">
					<h1 className="text-sm font-bold tracking-tight text-neutral-200">PiBun</h1>
				</div>
				<div className="flex flex-1 items-center justify-center">
					<p className="text-xs text-neutral-600">Sessions (coming soon)</p>
				</div>
			</aside>

			{/* Main chat area */}
			<main className="flex min-w-0 flex-1 flex-col">
				<ConnectionBanner />
				<ErrorBanner />

				{/* Toolbar — model selector, thinking level, etc. */}
				<div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
					<ModelSelector />
					<ThinkingSelector />
				</div>

				<ChatView />
				<Composer />
			</main>
		</div>
	);
}
