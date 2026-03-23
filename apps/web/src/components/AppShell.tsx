/**
 * AppShell — top-level layout: sidebar (left) + main area (right).
 *
 * Main area is a flex column: toolbar (model/thinking selectors + session controls) +
 * chat messages (scrollable) + composer (fixed bottom).
 * Sidebar shows session list, current session info, and new session button.
 */

import { ChatView } from "@/components/ChatView";
import { CompactButton } from "@/components/CompactButton";
import { Composer } from "@/components/Composer";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ForkDialog } from "@/components/ForkDialog";
import { ModelSelector } from "@/components/ModelSelector";
import { SessionStats } from "@/components/SessionStats";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { ThinkingSelector } from "@/components/ThinkingSelector";
import { ToastContainer } from "@/components/ToastContainer";
import { ExtensionDialog } from "@/components/extension";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export function AppShell() {
	useKeyboardShortcuts();
	return (
		<div className="flex h-screen bg-neutral-950 text-neutral-100">
			{/* Extension UI dialog overlay (modal — blocks interaction until response) */}
			<ExtensionDialog />

			{/* Toast notifications — fixed bottom-right overlay */}
			<ToastContainer />

			{/* Sidebar — session list and management */}
			<Sidebar />

			{/* Main chat area */}
			<main className="flex min-w-0 flex-1 flex-col">
				<ConnectionBanner />
				<ErrorBanner />

				{/* Toolbar — model/thinking selectors + session management */}
				<div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
					<ModelSelector />
					<ThinkingSelector />

					{/* Spacer pushes session controls to the right */}
					<div className="flex-1" />

					{/* Session stats — tokens + cost */}
					<SessionStats />

					{/* Session management controls */}
					<div className="flex items-center gap-1 border-l border-neutral-800 pl-2">
						<CompactButton />
						<ForkDialog />
					</div>
				</div>

				<ChatView />

				{/* Extension status indicators — shown above composer when active */}
				<StatusBar />

				<Composer />
			</main>
		</div>
	);
}
