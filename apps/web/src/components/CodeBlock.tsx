/**
 * CodeBlock — syntax-highlighted code block using Shiki.
 *
 * Lazily highlights code on mount/update. Shows plain text fallback
 * while the highlighter loads. Includes a copy-to-clipboard button
 * and language label.
 */

import { cn } from "@/lib/cn";
import { highlightCode } from "@/lib/highlighter";
import { memo, useCallback, useEffect, useRef, useState } from "react";

interface CodeBlockProps {
	/** The code to highlight. */
	code: string;
	/** Language identifier (e.g., "typescript", "bash"). Empty = plain text. */
	language: string;
	/** Optional additional className for the wrapper. */
	className?: string;
}

export const CodeBlock = memo(function CodeBlock({ code, language, className }: CodeBlockProps) {
	const [html, setHtml] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Highlight code asynchronously
	useEffect(() => {
		let cancelled = false;
		highlightCode(code, language).then((result) => {
			if (!cancelled) setHtml(result);
		});
		return () => {
			cancelled = true;
		};
	}, [code, language]);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code);
		setCopied(true);
		if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
	}, [code]);

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const displayLanguage = language || "text";

	return (
		<div
			className={cn(
				"group relative overflow-hidden rounded-lg border border-border-secondary bg-code-bg",
				className,
			)}
		>
			{/* Header bar with language label and copy button */}
			<div className="flex items-center justify-between border-b border-border-secondary px-3 py-1.5">
				<span className="text-xs text-text-tertiary">{displayLanguage}</span>
				<button
					type="button"
					onClick={handleCopy}
					className={cn(
						"flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
						copied
							? "text-status-success-text"
							: "text-text-tertiary opacity-0 hover:text-text-secondary group-hover:opacity-100",
					)}
				>
					{copied ? (
						<>
							<CheckIcon />
							<span>Copied</span>
						</>
					) : (
						<>
							<CopyIcon />
							<span>Copy</span>
						</>
					)}
				</button>
			</div>

			{/* Code content */}
			{html ? (
				<div
					className="shiki-wrapper overflow-x-auto p-3 text-sm leading-relaxed [&>pre]:!bg-transparent [&>pre]:!p-0"
					/* biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki produces safe HTML from code strings */
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<pre className="overflow-x-auto p-3 text-sm leading-relaxed text-text-secondary">
					<code>{code}</code>
				</pre>
			)}
		</div>
	);
});

/** Clipboard copy icon (16x16). */
function CopyIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="h-3.5 w-3.5"
			aria-label="Copy to clipboard"
			role="img"
		>
			<path d="M10.5 3a.5.5 0 0 0-.5-.5H6a.5.5 0 0 0-.5.5v1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8.5V3ZM5.5 5.5H4.5v7h5v-7H5.5Z" />
			<path d="M12 2.5h-1.5v1H12a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-.5v1h.5a1.5 1.5 0 0 0 1.5-1.5V3.5A1.5 1.5 0 0 0 12 2h-.5v.5H12Z" />
		</svg>
	);
}

/** Checkmark icon (16x16). */
function CheckIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="h-3.5 w-3.5"
			aria-label="Copied"
			role="img"
		>
			<path
				fillRule="evenodd"
				d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}
