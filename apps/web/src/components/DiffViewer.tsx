/**
 * DiffViewer — syntax-highlighted unified diff viewer.
 *
 * Parses a unified diff string and renders it with:
 * - Shiki-based syntax highlighting (language inferred from file path)
 * - Old/new line numbers in two columns
 * - Color-coded backgrounds (green for additions, red for removals)
 * - Hunk headers with @@ markers
 * - Copy-to-clipboard button
 *
 * Used by GitPanel for viewing file diffs. Standalone component for
 * potential reuse in "Diff review mode" (parking lot feature).
 */

import { useShikiTheme } from "@/lib/highlighter";
import { type ThemedToken, tokenizeCode } from "@/lib/highlighter";
import { cn, inferLanguageFromPath } from "@/lib/utils";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

interface DiffLine {
	type: "context" | "add" | "remove";
	/** Code content with +/- prefix stripped. */
	content: string;
	oldLineNum: number | null;
	newLineNum: number | null;
}

interface DiffHunk {
	header: string;
	lines: DiffLine[];
}

interface ParsedDiff {
	/** File path extracted from diff headers (e.g. "src/foo.ts"). */
	filePath: string;
	hunks: DiffHunk[];
	/** Total number of additions. */
	additions: number;
	/** Total number of deletions. */
	deletions: number;
}

// ============================================================================
// Diff parser
// ============================================================================

/** Max lines to syntax-highlight. Beyond this, fall back to plain colored text. */
const MAX_HIGHLIGHT_LINES = 2000;

/**
 * Parse a unified diff string into structured hunks with typed lines.
 * Handles standard `git diff` output format.
 */
function parseDiff(raw: string): ParsedDiff {
	const lines = raw.split("\n");
	let filePath = "";
	const hunks: DiffHunk[] = [];
	let currentHunk: DiffHunk | null = null;
	let oldLine = 0;
	let newLine = 0;
	let additions = 0;
	let deletions = 0;

	for (const line of lines) {
		// File headers: extract path
		if (line.startsWith("diff --git ")) {
			const match = /diff --git a\/(.+) b\/(.+)/.exec(line);
			if (match) filePath = match[2] ?? match[1] ?? "";
			continue;
		}
		if (
			line.startsWith("index ") ||
			line.startsWith("--- ") ||
			line.startsWith("new file") ||
			line.startsWith("deleted file") ||
			line.startsWith("similarity index") ||
			line.startsWith("rename ") ||
			line.startsWith("old mode") ||
			line.startsWith("new mode")
		) {
			// Also try to extract path from +++ header
			if (line.startsWith("+++ b/") && !filePath) {
				filePath = line.slice(6);
			}
			continue;
		}

		// Hunk header: @@ -oldStart,oldCount +newStart,newCount @@ context
		if (line.startsWith("@@ ")) {
			const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(line);
			if (match) {
				oldLine = Number.parseInt(match[1] ?? "0", 10);
				newLine = Number.parseInt(match[2] ?? "0", 10);
				currentHunk = { header: line, lines: [] };
				hunks.push(currentHunk);
			}
			continue;
		}

		if (!currentHunk) continue;

		// Skip "\ No newline at end of file" and similar markers
		if (line.startsWith("\\")) continue;

		// Diff lines
		if (line.startsWith("+")) {
			currentHunk.lines.push({
				type: "add",
				content: line.slice(1),
				oldLineNum: null,
				newLineNum: newLine,
			});
			newLine++;
			additions++;
		} else if (line.startsWith("-")) {
			currentHunk.lines.push({
				type: "remove",
				content: line.slice(1),
				oldLineNum: oldLine,
				newLineNum: null,
			});
			oldLine++;
			deletions++;
		} else {
			// Context line (starts with space) or empty line
			currentHunk.lines.push({
				type: "context",
				content: line.startsWith(" ") ? line.slice(1) : line,
				oldLineNum: oldLine,
				newLineNum: newLine,
			});
			oldLine++;
			newLine++;
		}
	}

	return { filePath, hunks, additions, deletions };
}

// ============================================================================
// Token mapping — old/new file reconstruction for proper syntax context
// ============================================================================

/**
 * Build tokens for diff lines using old/new file reconstruction.
 *
 * Reconstructs the "old" file (context + removals) and "new" file
 * (context + additions), tokenizes each, then maps tokens back to
 * the original diff lines. This preserves syntax context across
 * multi-line constructs (strings, comments, etc.).
 */
async function tokenizeDiffHunks(
	hunks: DiffHunk[],
	lang: string,
): Promise<Map<string, ThemedToken[]>> {
	// Collect old-file lines and new-file lines across all hunks
	const oldLines: string[] = [];
	const newLines: string[] = [];
	// Map: "hunk:line" → { side: "old"|"new", index: number }
	const lineMapping = new Map<string, { side: "old" | "new"; index: number }>();

	for (let hi = 0; hi < hunks.length; hi++) {
		const hunk = hunks[hi];
		if (!hunk) continue;
		for (let li = 0; li < hunk.lines.length; li++) {
			const line = hunk.lines[li];
			if (!line) continue;
			const key = `${String(hi)}:${String(li)}`;

			if (line.type === "context") {
				lineMapping.set(key, { side: "new", index: newLines.length });
				oldLines.push(line.content);
				newLines.push(line.content);
			} else if (line.type === "add") {
				lineMapping.set(key, { side: "new", index: newLines.length });
				newLines.push(line.content);
			} else {
				lineMapping.set(key, { side: "old", index: oldLines.length });
				oldLines.push(line.content);
			}
		}
	}

	// Tokenize both files
	const [oldTokens, newTokens] = await Promise.all([
		tokenizeCode(oldLines.join("\n"), lang),
		tokenizeCode(newLines.join("\n"), lang),
	]);

	// Map tokens back to diff lines
	const result = new Map<string, ThemedToken[]>();
	for (const [key, mapping] of lineMapping) {
		const tokens = mapping.side === "old" ? oldTokens[mapping.index] : newTokens[mapping.index];
		if (tokens) {
			result.set(key, tokens);
		}
	}

	return result;
}

// ============================================================================
// Components
// ============================================================================

interface DiffViewerProps {
	/** Raw unified diff string. */
	diff: string;
	/** File path for language inference (fallback: extracted from diff headers). */
	filePath?: string | undefined;
	/** Optional className for the outer wrapper. */
	className?: string | undefined;
}

export const DiffViewer = memo(function DiffViewer({ diff, filePath, className }: DiffViewerProps) {
	const [tokenMap, setTokenMap] = useState<Map<string, ThemedToken[]> | null>(null);
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const shikiTheme = useShikiTheme();

	const parsed = useMemo(() => parseDiff(diff), [diff]);
	const effectivePath = filePath ?? parsed.filePath;
	const lang = inferLanguageFromPath(effectivePath);
	const totalLines = parsed.hunks.reduce((sum, h) => sum + h.lines.length, 0);
	const shouldHighlight = lang !== "" && totalLines <= MAX_HIGHLIGHT_LINES;

	// Tokenize asynchronously — re-runs when parsed hunks, language, or Shiki theme change.
	// shikiTheme is an intentional trigger dep: tokenizeDiffHunks → tokenizeCode reads
	// the module-level currentTheme internally.
	// biome-ignore lint/correctness/useExhaustiveDependencies: shikiTheme triggers re-tokenize on theme switch
	useEffect(() => {
		if (!shouldHighlight) {
			setTokenMap(null);
			return;
		}

		let cancelled = false;
		tokenizeDiffHunks(parsed.hunks, lang).then((result) => {
			if (!cancelled) setTokenMap(result);
		});
		return () => {
			cancelled = true;
		};
	}, [parsed.hunks, lang, shouldHighlight, shikiTheme]);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(diff);
		setCopied(true);
		if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
	}, [diff]);

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	if (parsed.hunks.length === 0) {
		return <div className={cn("text-xs text-text-muted", className)}>No diff hunks found</div>;
	}

	return (
		<div className={cn("overflow-hidden font-mono text-[11px]", className)}>
			{/* Stats bar */}
			<div className="flex items-center justify-between border-b border-border-secondary bg-surface-primary/50 px-3 py-1">
				<div className="flex items-center gap-3">
					{parsed.additions > 0 && (
						<span className="text-status-success-text">+{parsed.additions}</span>
					)}
					{parsed.deletions > 0 && (
						<span className="text-status-error-text">−{parsed.deletions}</span>
					)}
					{lang && <span className="text-text-muted">{lang}</span>}
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className={cn(
						"flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
						copied ? "text-status-success-text" : "text-text-muted hover:text-text-secondary",
					)}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>

			{/* Hunks */}
			<div className="overflow-x-auto">
				{parsed.hunks.map((hunk, hi) => (
					<HunkSection key={hunk.header} hunk={hunk} hunkIndex={hi} tokenMap={tokenMap} />
				))}
			</div>
		</div>
	);
});

// ============================================================================
// Hunk section
// ============================================================================

interface HunkSectionProps {
	hunk: DiffHunk;
	hunkIndex: number;
	tokenMap: Map<string, ThemedToken[]> | null;
}

const HunkSection = memo(function HunkSection({ hunk, hunkIndex, tokenMap }: HunkSectionProps) {
	// Extract context text from hunk header (part after @@...@@)
	const headerContext = /@@ .+? @@(.*)/.exec(hunk.header)?.[1]?.trim() ?? "";

	return (
		<div>
			{/* Hunk header */}
			<div className="border-b border-border-muted bg-accent-soft px-3 py-1 text-accent-text/60">
				<span className="select-none text-accent-text/40">@@</span>
				{headerContext && <span className="ml-2 text-accent-text/40">{headerContext}</span>}
			</div>

			{/* Diff lines */}
			{hunk.lines.map((line, li) => (
				<DiffLineRow
					key={`${String(hunkIndex)}:${String(li)}`}
					line={line}
					tokens={tokenMap?.get(`${String(hunkIndex)}:${String(li)}`) ?? null}
				/>
			))}
		</div>
	);
});

// ============================================================================
// Diff line row
// ============================================================================

interface DiffLineRowProps {
	line: DiffLine;
	tokens: ThemedToken[] | null;
}

const DiffLineRow = memo(function DiffLineRow({ line, tokens }: DiffLineRowProps) {
	const isAdd = line.type === "add";
	const isRemove = line.type === "remove";

	const bgClass = isAdd ? "bg-status-success-bg/40" : isRemove ? "bg-status-error-bg/25" : "";

	const numClass = isAdd
		? "text-status-success/30"
		: isRemove
			? "text-status-error/30"
			: "text-text-muted";

	const gutterChar = isAdd ? "+" : isRemove ? "−" : " ";
	const gutterClass = isAdd
		? "text-status-success/50"
		: isRemove
			? "text-status-error/50"
			: "text-transparent";

	return (
		<div className={cn("flex leading-[18px]", bgClass)}>
			{/* Old line number */}
			<span className={cn("w-10 shrink-0 select-none text-right pr-1 tabular-nums", numClass)}>
				{line.oldLineNum ?? ""}
			</span>
			{/* New line number */}
			<span className={cn("w-10 shrink-0 select-none text-right pr-1 tabular-nums", numClass)}>
				{line.newLineNum ?? ""}
			</span>
			{/* Gutter indicator */}
			<span className={cn("w-5 shrink-0 select-none text-center", gutterClass)}>{gutterChar}</span>
			{/* Code content */}
			<span className="min-w-0 flex-1 whitespace-pre pr-3">
				{tokens ? (
					<TokenizedLine tokens={tokens} />
				) : (
					<PlainLine content={line.content} type={line.type} />
				)}
			</span>
		</div>
	);
});

// ============================================================================
// Token rendering
// ============================================================================

interface TokenizedLineProps {
	tokens: ThemedToken[];
}

const TokenizedLine = memo(function TokenizedLine({ tokens }: TokenizedLineProps) {
	if (tokens.length === 0) return <> </>;

	return (
		<>
			{tokens.map((token, i) => (
				<span
					key={`${String(i)}-${token.content.slice(0, 8)}`}
					style={token.color ? { color: token.color } : undefined}
				>
					{token.content}
				</span>
			))}
		</>
	);
});

/** Fallback plain text line (before tokenization completes or for non-highlighted diffs). */
function PlainLine({ content, type }: { content: string; type: DiffLine["type"] }) {
	const colorClass =
		type === "add"
			? "text-status-success-text/80"
			: type === "remove"
				? "text-status-error-text/80"
				: "text-text-secondary";

	return <span className={colorClass}>{content || " "}</span>;
}
