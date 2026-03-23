/**
 * ExportDialog — export the current session as HTML, Markdown, or JSON.
 *
 * Flow:
 * 1. User clicks "Export" button (or Ctrl+Shift+E) → opens dropdown
 * 2. User picks a format → triggers export
 * 3. HTML: calls session.exportHtml → receives content → downloads
 * 4. Markdown: fetches messages via session.getMessages → renders to markdown → downloads
 * 5. JSON: fetches messages via session.getMessages → serializes → downloads
 *
 * The dropdown closes on selection, Escape, or click-outside.
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { getTransport } from "@/wireTransport";
import type { PiAgentMessage, PiModel } from "@pibun/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

type ExportFormat = "html" | "markdown" | "json";

interface FormatOption {
	id: ExportFormat;
	label: string;
	description: string;
	extension: string;
	mimeType: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
	{
		id: "html",
		label: "HTML",
		description: "Self-contained styled page",
		extension: ".html",
		mimeType: "text/html",
	},
	{
		id: "markdown",
		label: "Markdown",
		description: "Plain text with formatting",
		extension: ".md",
		mimeType: "text/markdown",
	},
	{
		id: "json",
		label: "JSON",
		description: "Raw message data with metadata",
		extension: ".json",
		mimeType: "application/json",
	},
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a filename for the exported session.
 */
function generateFilename(format: FormatOption, sessionName: string | null): string {
	const base = sessionName ?? "pibun-session";
	const safe = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
	const timestamp = new Date().toISOString().slice(0, 10);
	return `${safe}_${timestamp}${format.extension}`;
}

/**
 * Trigger a file download in the browser via blob URL.
 */
function downloadBlob(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Convert messages to Markdown format.
 */
function messagesToMarkdown(messages: ChatMessage[]): string {
	const lines: string[] = [];
	lines.push("# Session Export");
	lines.push("");
	lines.push(`Exported: ${new Date().toISOString()}`);
	lines.push("");
	lines.push("---");
	lines.push("");

	for (const msg of messages) {
		switch (msg.type) {
			case "user":
				lines.push("## 🧑 User");
				lines.push("");
				lines.push(msg.content);
				lines.push("");
				break;

			case "assistant":
				lines.push("## 🤖 Assistant");
				lines.push("");
				if (msg.thinking) {
					lines.push("<details>");
					lines.push("<summary>Thinking</summary>");
					lines.push("");
					lines.push(msg.thinking);
					lines.push("");
					lines.push("</details>");
					lines.push("");
				}
				lines.push(msg.content);
				lines.push("");
				break;

			case "tool_call":
				if (msg.toolCall) {
					lines.push(`### 🔧 Tool: \`${msg.toolCall.name}\``);
					lines.push("");
					lines.push("```json");
					lines.push(JSON.stringify(msg.toolCall.args, null, 2));
					lines.push("```");
					lines.push("");
				}
				break;

			case "tool_result":
				if (msg.toolResult) {
					lines.push("#### Result");
					lines.push("");
					if (msg.toolResult.isError) {
						lines.push("**Error:**");
						lines.push("");
					}
					lines.push("```");
					lines.push(msg.toolResult.content);
					lines.push("```");
					lines.push("");
				}
				break;

			case "system":
				lines.push(`> ℹ️ ${msg.content}`);
				lines.push("");
				break;
		}
	}

	return lines.join("\n");
}

/**
 * Convert Pi agent messages to a JSON export with metadata.
 */
function messagesToJson(
	piMessages: PiAgentMessage[],
	sessionName: string | null,
	model: PiModel | null,
): string {
	const payload = {
		exportedAt: new Date().toISOString(),
		sessionName,
		model: model ? { provider: model.provider, id: model.id, name: model.name } : null,
		messageCount: piMessages.length,
		messages: piMessages,
	};
	return JSON.stringify(payload, null, 2);
}

/** Extract a user-friendly error message from any thrown value. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

// ============================================================================
// Component
// ============================================================================

export function ExportDialog() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const sessionId = useStore((s) => s.sessionId);
	const sessionName = useStore((s) => s.sessionName);
	const model = useStore((s) => s.model);
	const messages = useStore((s) => s.messages);
	const setLastError = useStore((s) => s.setLastError);
	const addToast = useStore((s) => s.addToast);

	const [isOpen, setIsOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;
	const isDisabled = !isConnected || !hasSession || isExporting;

	// Toggle dropdown
	const handleToggle = useCallback(() => {
		if (isDisabled) return;
		setIsOpen((prev) => !prev);
	}, [isDisabled]);

	// Export in the selected format
	const handleExport = useCallback(
		async (format: FormatOption) => {
			setIsExporting(true);
			setIsOpen(false);

			try {
				const transport = getTransport();
				let content: string;
				let filename: string;

				switch (format.id) {
					case "html": {
						const result = await transport.request("session.exportHtml", {});
						content = result.html;
						filename = generateFilename(format, sessionName);
						break;
					}

					case "markdown": {
						// Use local messages for markdown (already in the store)
						content = messagesToMarkdown(messages);
						filename = generateFilename(format, sessionName);
						break;
					}

					case "json": {
						// Fetch raw Pi messages for complete JSON export
						const result = await transport.request("session.getMessages");
						content = messagesToJson(result.messages, sessionName, model);
						filename = generateFilename(format, sessionName);
						break;
					}
				}

				downloadBlob(content, filename, format.mimeType);
				addToast(`Exported as ${format.label}`, "info");
			} catch (err) {
				setLastError(`Export failed: ${errorMessage(err)}`);
			} finally {
				setIsExporting(false);
			}
		},
		[sessionName, model, messages, setLastError, addToast],
	);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// Close on click outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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

	return (
		<div className="relative" ref={dropdownRef}>
			{/* Trigger button */}
			<button
				type="button"
				onClick={handleToggle}
				disabled={isDisabled}
				title="Export session (Ctrl+Shift+E)"
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
					isDisabled
						? "cursor-not-allowed text-neutral-600"
						: "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
				)}
			>
				{/* Download/export icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="Export session"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M4.22 11.78a.75.75 0 0 1 0-1.06L7.22 7.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 1 1-1.06 1.06L8.75 10.31V14.5a.75.75 0 0 1-1.5 0v-4.19l-1.47 1.47a.75.75 0 0 1-1.06 0z"
						clipRule="evenodd"
					/>
					<path d="M3.5 3.75a.75.75 0 0 0-.75.75v7c0 .414.336.75.75.75H5a.75.75 0 0 1 0 1.5H3.5A2.25 2.25 0 0 1 1.25 11.5v-7A2.25 2.25 0 0 1 3.5 2.25h9A2.25 2.25 0 0 1 14.75 4.5v7a2.25 2.25 0 0 1-2.25 2.25H11a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 0 .75-.75v-7a.75.75 0 0 0-.75-.75h-9z" />
				</svg>
				{isExporting ? "Exporting…" : "Export"}
			</button>

			{/* Dropdown — format picker */}
			{isOpen && (
				<div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
					{/* Header */}
					<div className="border-b border-neutral-800 px-3 py-2">
						<p className="text-xs font-medium text-neutral-300">Export session</p>
						<p className="mt-0.5 text-xs text-neutral-500">Choose a format</p>
					</div>

					{/* Format options */}
					<div>
						{FORMAT_OPTIONS.map((format, index) => (
							<button
								key={format.id}
								type="button"
								onClick={() => handleExport(format)}
								className={cn(
									"flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-neutral-800",
									index < FORMAT_OPTIONS.length - 1 && "border-b border-neutral-800/50",
								)}
							>
								<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs font-bold text-neutral-400">
									{format.extension}
								</div>
								<div>
									<p className="text-sm font-medium text-neutral-200">{format.label}</p>
									<p className="text-xs text-neutral-500">{format.description}</p>
								</div>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
