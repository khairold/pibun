/**
 * AppShell — top-level layout: sidebar (left) + main area (right).
 *
 * Main area is a flex column: toolbar (model/thinking selectors + session controls) +
 * chat messages (scrollable) + composer (fixed bottom).
 * Sidebar shows session list, current session info, and new session button.
 *
 * Responsive behavior:
 * - On narrow viewports (< md): sidebar is an overlay, toggled via hamburger button
 * - On desktop viewports (≥ md): sidebar is inline, toggled via Ctrl/Cmd+B
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
import { UpdateBanner } from "@/components/UpdateBanner";
import { ExtensionDialog } from "@/components/extension";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useStore } from "@/store";

export function AppShell() {
	useKeyboardShortcuts();

	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);

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
				<UpdateBanner />

				{/* Toolbar — sidebar toggle + model/thinking selectors + session management */}
				<div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
					{/* Sidebar toggle button — hamburger when closed, panel icon when open */}
					<button
						type="button"
						onClick={toggleSidebar}
						title={sidebarOpen ? "Hide sidebar (Ctrl+B)" : "Show sidebar (Ctrl+B)"}
						className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
					>
						{sidebarOpen ? (
							/* Panel left icon (sidebar visible) */
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-4 w-4"
								aria-label="Hide sidebar"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75v-8.5zm1.5.75v7h2.5v-7h-2.5zm4 0v7h5v-7h-5z"
									clipRule="evenodd"
								/>
							</svg>
						) : (
							/* Hamburger icon (sidebar hidden) */
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-4 w-4"
								aria-label="Show sidebar"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75zM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75z"
									clipRule="evenodd"
								/>
							</svg>
						)}
					</button>

					{/* Divider between toggle and selectors */}
					<div className="h-5 w-px bg-neutral-800" />

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
