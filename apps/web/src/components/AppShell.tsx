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
import { DiffPanel } from "@/components/DiffPanel";
import { ErrorBanner, HealthBanner } from "@/components/ErrorBanner";
import { ExportDialog } from "@/components/ExportDialog";
import { ExtensionWidgetBar } from "@/components/ExtensionWidgets";
import { ForkDialog } from "@/components/ForkDialog";
import { GitPanel } from "@/components/GitPanel";
import { GitStatusBar } from "@/components/GitStatusBar";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { ModelSelector } from "@/components/ModelSelector";
import { PluginManager } from "@/components/PluginManager";
import { PluginBottomPanels, PluginRightPanels } from "@/components/PluginPanel";
import { SessionStats } from "@/components/SessionStats";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";

import { TerminalPane } from "@/components/TerminalPane";
import { ThemeSelector } from "@/components/ThemeSelector";
import { ThinkingSelector } from "@/components/ThinkingSelector";
import { ToastContainer } from "@/components/ToastContainer";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ExtensionDialog } from "@/components/extension";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useWindowTitle } from "@/hooks/useWindowTitle";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";

function SettingsButton() {
	const setSettingsOpen = useStore((s) => s.setSettingsOpen);
	return (
		<button
			type="button"
			onClick={() => setSettingsOpen(true)}
			className="flex items-center gap-1.5 rounded-md border border-border-primary bg-surface-primary px-2 py-1 text-xs font-medium text-text-primary transition-colors hover:border-text-tertiary hover:bg-surface-secondary"
			title="Settings (Ctrl+,)"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5"
				aria-label="Settings"
				role="img"
			>
				<path
					fillRule="evenodd"
					d="M6.955 1.45A.5.5 0 0 1 7.452 1h1.096a.5.5 0 0 1 .497.45l.17 1.699c.484.12.94.312 1.356.562l1.321-.832a.5.5 0 0 1 .67.065l.774.775a.5.5 0 0 1 .066.67l-.832 1.32c.25.417.443.873.563 1.357l1.699.17a.5.5 0 0 1 .45.496v1.096a.5.5 0 0 1-.45.497l-1.699.17c-.12.484-.312.94-.562 1.356l.832 1.321a.5.5 0 0 1-.066.67l-.774.774a.5.5 0 0 1-.67.066l-1.32-.832c-.417.25-.873.443-1.357.563l-.17 1.699a.5.5 0 0 1-.497.45H7.452a.5.5 0 0 1-.497-.45l-.17-1.699a4.973 4.973 0 0 1-1.356-.562l-1.321.832a.5.5 0 0 1-.67-.066l-.774-.774a.5.5 0 0 1-.066-.67l.832-1.32a4.972 4.972 0 0 1-.563-1.357l-1.699-.17A.5.5 0 0 1 1 8.548V7.452a.5.5 0 0 1 .45-.497l1.699-.17c.12-.484.312-.94.562-1.356l-.832-1.321a.5.5 0 0 1 .066-.67l.774-.774a.5.5 0 0 1 .67-.066l1.32.832c.417-.25.873-.443 1.357-.563l.17-1.699zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
					clipRule="evenodd"
				/>
			</svg>
		</button>
	);
}

export function AppShell() {
	useKeyboardShortcuts();
	useWindowTitle();

	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);
	const isWindowFocused = useStore((s) => s.isWindowFocused);

	return (
		<div className="flex h-screen bg-surface-base text-text-primary">
			{/* Extension UI dialog overlay (modal — blocks interaction until response) */}
			<ExtensionDialog />

			{/* Image preview modal — full-size overlay on image click */}
			<ImagePreviewModal />

			{/* Settings dialog — modal overlay */}
			<SettingsDialog />

			{/* Toast notifications — fixed bottom-right overlay */}
			<ToastContainer />

			{/* Sidebar — session list and management */}
			<Sidebar />

			{/* Main chat area + right plugin panel */}
			<div className="flex min-w-0 flex-1">
				<main className="flex min-w-0 flex-1 flex-col">
					<ConnectionBanner />
					<HealthBanner />
					<ErrorBanner />
					<UpdateBanner />

					{/* Toolbar — sidebar toggle + model/thinking selectors + session management */}
					<div
						className={cn(
							"flex items-center gap-2 border-b border-border-secondary px-4 py-2 transition-opacity duration-200",
							!isWindowFocused && "opacity-50",
						)}
					>
						{/* Sidebar toggle button — hamburger when closed, panel icon when open */}
						<button
							type="button"
							onClick={toggleSidebar}
							title={sidebarOpen ? "Hide sidebar (Ctrl+B)" : "Show sidebar (Ctrl+B)"}
							className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
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
						<div className="h-5 w-px bg-border-secondary" />

						<ModelSelector />
						<ThinkingSelector />

						{/* Spacer pushes session controls to the right */}
						<div className="flex-1" />

						{/* Git status — branch + changed files */}
						<GitStatusBar />

						{/* Divider between git and stats (when both visible) */}
						<div className="h-5 w-px bg-border-secondary" />

						{/* Session stats — tokens + cost */}
						<SessionStats />

						{/* Session management controls */}
						<div className="flex items-center gap-1 border-l border-border-secondary pl-2">
							<CompactButton />
							<ForkDialog />
							<ExportDialog />
							<PluginManager />
							<ThemeSelector />
							<SettingsButton />
						</div>
					</div>

					{/* Git changed files panel — collapsible between toolbar and chat */}
					<GitPanel />

					<ChatView />

					{/* Terminal panel — resizable bottom pane */}
					<TerminalPane />

					{/* Plugin bottom panels — below terminal */}
					<PluginBottomPanels />

					{/* Extension status indicators — shown above composer when active */}
					<StatusBar />

					{/* Extension widgets above composer */}
					<ExtensionWidgetBar placement="aboveEditor" />

					<Composer />

					{/* Extension widgets below composer */}
					<ExtensionWidgetBar placement="belowEditor" />
				</main>

				{/* Diff panel — beside main area (toggled via Ctrl/Cmd+D) */}
				<DiffPanel />

				{/* Plugin right panels — beside main area */}
				<PluginRightPanels />
			</div>
		</div>
	);
}
