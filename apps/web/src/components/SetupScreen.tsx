/**
 * SetupScreen — full-page onboarding when Pi CLI is missing or outdated.
 *
 * Shown instead of the main app when:
 * - Pi is not installed → blocking, must install before continuing
 * - Pi is outdated → informational, user can dismiss and continue
 *
 * Fetches the latest version from npm (via server) rather than hardcoding a minimum.
 */

import { checkPrerequisites } from "@/lib/appActions";
import { useStore } from "@/store";
import { useCallback, useState } from "react";

/** Copy text to clipboard with visual feedback. */
function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [text]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="ml-2 shrink-0 rounded border border-border-primary px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
			title="Copy to clipboard"
		>
			{copied ? "Copied!" : "Copy"}
		</button>
	);
}

/** Inline code block with copy button. */
function CommandBlock({ command }: { command: string }) {
	return (
		<div className="flex items-center rounded-lg border border-border-primary bg-surface-secondary px-4 py-3 font-mono text-sm">
			<code className="flex-1 select-all text-text-primary">{command}</code>
			<CopyButton text={command} />
		</div>
	);
}

/** Status indicator badge. */
function StatusBadge({ found, isLatest }: { found: boolean; isLatest: boolean }) {
	if (found && isLatest) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
				<svg
					className="h-3 w-3"
					viewBox="0 0 16 16"
					fill="currentColor"
					role="img"
					aria-label="Up to date"
				>
					<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
				</svg>
				Up to date
			</span>
		);
	}
	if (found && !isLatest) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
				<svg
					className="h-3 w-3"
					viewBox="0 0 16 16"
					fill="currentColor"
					role="img"
					aria-label="Update available"
				>
					<path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm1 7a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" />
				</svg>
				Update available
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
			<svg
				className="h-3 w-3"
				viewBox="0 0 16 16"
				fill="currentColor"
				role="img"
				aria-label="Not found"
			>
				<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
			</svg>
			Not found
		</span>
	);
}

export function SetupScreen() {
	const pi = useStore((s) => s.prerequisitePi);
	const latestVersion = useStore((s) => s.prerequisiteLatestPiVersion);
	const checking = useStore((s) => s.prerequisiteChecking);
	const dismiss = useStore((s) => s.dismissPrerequisite);

	const piFound = pi?.found ?? false;
	const piIsLatest = pi?.isLatest ?? false;
	const piVersion = pi?.version ?? null;

	const needsInstall = !piFound;
	const needsUpgrade = piFound && !piIsLatest;

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-surface-primary">
			<div className="w-full max-w-lg px-6">
				{/* Logo / Title */}
				<div className="mb-8 text-center">
					<h1 className="mb-2 text-2xl font-bold text-text-primary">Welcome to PiBun</h1>
					<p className="text-sm text-text-secondary">
						{needsInstall
							? "PiBun needs the Pi coding agent CLI to work. Let's get you set up."
							: "A new version of Pi is available."}
					</p>
				</div>

				{/* Status Card */}
				<div className="mb-6 rounded-xl border border-border-primary bg-surface-secondary p-6">
					<div className="mb-4 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium text-text-primary">Pi CLI</span>
							{piVersion && <span className="text-xs text-text-tertiary">v{piVersion}</span>}
						</div>
						<StatusBadge found={piFound} isLatest={piIsLatest} />
					</div>

					{latestVersion && (
						<p className="text-xs text-text-tertiary">Latest available: v{latestVersion}</p>
					)}
				</div>

				{/* Instructions */}
				<div className="mb-6 space-y-4">
					{needsInstall && (
						<>
							<p className="text-sm text-text-secondary">Install Pi globally with npm:</p>
							<CommandBlock command="npm install -g @mariozechner/pi-coding-agent" />
							<p className="text-xs text-text-tertiary">
								Requires{" "}
								<a
									href="https://nodejs.org"
									target="_blank"
									rel="noopener noreferrer"
									className="text-accent-primary underline decoration-accent-primary/30 hover:decoration-accent-primary"
								>
									Node.js
								</a>{" "}
								(v18+) to be installed first.
							</p>
						</>
					)}

					{needsUpgrade && (
						<>
							<p className="text-sm text-text-secondary">
								Your Pi CLI (v{piVersion}) can be updated to v{latestVersion}:
							</p>
							<CommandBlock command="npm install -g @mariozechner/pi-coding-agent@latest" />
						</>
					)}

					{!needsInstall && !needsUpgrade && (
						<p className="text-sm text-green-400">Pi is up to date. You're good to go!</p>
					)}
				</div>

				{/* Action Buttons */}
				<div className="flex items-center justify-center gap-3">
					{/* Re-check button */}
					<button
						type="button"
						onClick={() => checkPrerequisites()}
						disabled={checking}
						className="flex items-center gap-2 rounded-lg border border-border-primary bg-surface-primary px-6 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-50"
					>
						{checking ? (
							<>
								<svg
									className="h-4 w-4 animate-spin"
									viewBox="0 0 16 16"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
									role="img"
									aria-label="Checking"
								>
									<circle
										cx="8"
										cy="8"
										r="6"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										className="opacity-25"
									/>
									<path
										d="M14 8a6 6 0 0 0-6-6"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
									/>
								</svg>
								Checking…
							</>
						) : (
							<>
								<svg
									className="h-4 w-4"
									viewBox="0 0 16 16"
									fill="currentColor"
									role="img"
									aria-label="Re-check"
								>
									<path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
								</svg>
								Re-check
							</>
						)}
					</button>

					{/* Skip button — only for upgrades, not for missing Pi */}
					{needsUpgrade && (
						<button
							type="button"
							onClick={dismiss}
							className="rounded-lg border border-border-primary bg-surface-primary px-6 py-2.5 text-sm font-medium text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
						>
							Skip for now
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
