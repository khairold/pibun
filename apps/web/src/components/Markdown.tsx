/**
 * Markdown — renders markdown content with syntax-highlighted code blocks.
 *
 * Uses react-markdown with remark-gfm for GitHub Flavored Markdown (tables,
 * strikethrough, task lists, autolinks). Fenced code blocks are rendered
 * with Shiki via CodeBlock. Inline code gets simple monospace styling.
 *
 * All markdown elements are styled with Tailwind classes to match the
 * dark theme.
 */

import { CodeBlock } from "@/components/CodeBlock";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { type MouseEvent, useCallback, useMemo } from "react";
import type { Components, ExtraProps } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

/**
 * Extract the language from a code block's className.
 * react-markdown sets className to "language-xxx" on code elements
 * inside pre blocks.
 */
function extractLanguage(className: string | undefined): string {
	if (!className) return "";
	const match = /language-(\S+)/.exec(className);
	return match ? (match[1] ?? "") : "";
}

// ============================================================================
// Markdown link → file path resolution
// ============================================================================

/** Known absolute path prefixes on POSIX systems. */
const POSIX_ROOT_PREFIXES = [
	"/Users/",
	"/home/",
	"/tmp/",
	"/var/",
	"/etc/",
	"/opt/",
	"/mnt/",
	"/Volumes/",
	"/private/",
	"/root/",
];

/** Pattern for Windows drive paths like `C:\foo` or `C:/foo`. */
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;

/** Trailing `:line` or `:line:col` suffix. */
const POSITION_SUFFIX_RE = /:(\d+)(?::(\d+))?$/;

/**
 * Resolve a markdown link href to a local file path, if it looks like one.
 * Returns `{ filePath, line?, column? }` or `null` for external URLs.
 */
function resolveFileLink(
	href: string | undefined,
	cwd: string | undefined,
): { filePath: string; line: number | undefined; column: number | undefined } | null {
	if (!href) return null;
	const raw = href.trim();
	if (raw.length === 0 || raw.startsWith("#")) return null;

	// file:// URLs → extract path
	if (raw.toLowerCase().startsWith("file://")) {
		try {
			const parsed = new URL(raw);
			let filePath = decodeURIComponent(parsed.pathname);
			// Browser URL parser encodes "C:/foo" as "/C:/foo"
			if (/^\/[A-Za-z]:[\\/]/.test(filePath)) filePath = filePath.slice(1);
			if (filePath.length === 0) return null;
			return { filePath, line: undefined, column: undefined };
		} catch {
			return null;
		}
	}

	// External schemes (http, https, mailto, etc.) → not a file
	if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) return null;
	// mailto:, tel:, etc.
	if (/^[A-Za-z][A-Za-z0-9+.-]*:[^/]/.test(raw) && !POSITION_SUFFIX_RE.test(raw)) return null;

	// Strip query string and hash
	let path = raw.split("?")[0] ?? raw;
	path = path.split("#")[0] ?? path;

	// Check if it looks like a file path
	const isAbsolutePosix = POSIX_ROOT_PREFIXES.some((p) => path.startsWith(p));
	const isAbsoluteWindows = WINDOWS_DRIVE_RE.test(path);
	const isRelative = path.startsWith("./") || path.startsWith("../") || path.startsWith("~/");
	// Bare relative like `src/foo/bar.ts` or `package.json`
	const isBareRelative =
		!path.startsWith("/") &&
		!isAbsoluteWindows &&
		(path.includes("/") || /\.[A-Za-z0-9]+$/.test(path)) &&
		!path.includes("://");

	if (!isAbsolutePosix && !isAbsoluteWindows && !isRelative && !isBareRelative) return null;

	// Extract :line:col suffix
	let line: number | undefined;
	let column: number | undefined;
	const posMatch = POSITION_SUFFIX_RE.exec(path);
	if (posMatch) {
		path = path.slice(0, posMatch.index);
		line = Number(posMatch[1]);
		column = posMatch[2] ? Number(posMatch[2]) : undefined;
	}

	// Resolve relative paths against CWD
	if (!isAbsolutePosix && !isAbsoluteWindows) {
		if (!cwd) return null;
		if (path.startsWith("~/")) {
			// Can't reliably resolve ~ without knowing home dir; skip
			return null;
		}
		// Normalize relative prefix
		if (path.startsWith("./")) path = path.slice(2);
		path = `${cwd.replace(/\/$/, "")}/${path}`;
	}

	return { filePath: path, line, column };
}

/**
 * Open a file in the user's code editor via the server.
 * Fire-and-forget — errors logged to console.
 */
function openFileInEditor(filePath: string, line?: number, column?: number): void {
	getTransport()
		.request("project.openFileInEditor", {
			filePath,
			...(line !== undefined && { line }),
			...(column !== undefined && { column }),
		})
		.catch((err: unknown) => {
			console.error("[Markdown] Failed to open file in editor:", err);
		});
}

// ============================================================================
// Component overrides
// ============================================================================

/**
 * Create custom component overrides for react-markdown.
 * Accepts an optional image click handler for the preview modal
 * and an optional cwd for resolving file path links.
 */
function createComponents(
	onImageClick?: (src: string, alt: string) => void,
	cwd?: string,
): Components {
	return {
		// ── Code blocks & inline code ────────────────────────────────────────
		pre({ children }: React.ComponentProps<"pre"> & ExtraProps) {
			// react-markdown wraps code blocks in <pre><code>...
			// We intercept <pre> and let the code component handle rendering.
			// We discard the pre's props (ref type mismatch with div) since
			// CodeBlock handles its own wrapper element.
			return <>{children}</>;
		},

		code({ className, children, ...props }: React.ComponentProps<"code"> & ExtraProps) {
			const language = extractLanguage(className);
			const content = String(children).replace(/\n$/, "");

			// Fenced code block (inside a <pre>) — has className with language
			// We detect block code by the presence of a language class or
			// content containing newlines
			const isBlock = Boolean(className) || content.includes("\n");

			if (isBlock) {
				return <CodeBlock code={content} language={language} />;
			}

			// Inline code
			return (
				<code
					className="rounded bg-code-inline-bg px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary"
					{...props}
				>
					{children}
				</code>
			);
		},

		// ── Block elements ───────────────────────────────────────────────────
		p({ children, ...props }: React.ComponentProps<"p"> & ExtraProps) {
			return (
				<p className="leading-relaxed" {...props}>
					{children}
				</p>
			);
		},

		h1({ children, ...props }: React.ComponentProps<"h1"> & ExtraProps) {
			return (
				<h1 className="mb-3 mt-6 text-xl font-bold text-text-primary first:mt-0" {...props}>
					{children}
				</h1>
			);
		},

		h2({ children, ...props }: React.ComponentProps<"h2"> & ExtraProps) {
			return (
				<h2 className="mb-2 mt-5 text-lg font-semibold text-text-primary first:mt-0" {...props}>
					{children}
				</h2>
			);
		},

		h3({ children, ...props }: React.ComponentProps<"h3"> & ExtraProps) {
			return (
				<h3 className="mb-2 mt-4 text-base font-semibold text-text-primary first:mt-0" {...props}>
					{children}
				</h3>
			);
		},

		h4({ children, ...props }: React.ComponentProps<"h4"> & ExtraProps) {
			return (
				<h4 className="mb-1 mt-3 text-sm font-semibold text-text-primary first:mt-0" {...props}>
					{children}
				</h4>
			);
		},

		// ── Lists ────────────────────────────────────────────────────────────
		ul({ children, ...props }: React.ComponentProps<"ul"> & ExtraProps) {
			return (
				<ul className="my-2 list-disc space-y-1 pl-6 marker:text-text-muted" {...props}>
					{children}
				</ul>
			);
		},

		ol({ children, ...props }: React.ComponentProps<"ol"> & ExtraProps) {
			return (
				<ol className="my-2 list-decimal space-y-1 pl-6 marker:text-text-tertiary" {...props}>
					{children}
				</ol>
			);
		},

		li({ children, ...props }: React.ComponentProps<"li"> & ExtraProps) {
			return (
				<li className="leading-relaxed" {...props}>
					{children}
				</li>
			);
		},

		// ── Links ────────────────────────────────────────────────────────────
		a({ children, href, ...props }: React.ComponentProps<"a"> & ExtraProps) {
			const fileTarget = resolveFileLink(href, cwd);

			if (fileTarget) {
				// File path link — open in editor on click
				return (
					<a
						href={href}
						className="text-accent-text underline decoration-accent-text/30 transition-colors hover:text-accent-text/80 hover:decoration-accent-text/50"
						title={`Open ${fileTarget.filePath}${fileTarget.line ? `:${fileTarget.line}` : ""} in editor`}
						onClick={(e: MouseEvent<HTMLAnchorElement>) => {
							e.preventDefault();
							openFileInEditor(fileTarget.filePath, fileTarget.line, fileTarget.column);
						}}
						{...props}
					>
						{children}
					</a>
				);
			}

			// External URL — open in new tab
			return (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent-text underline decoration-accent-text/30 transition-colors hover:text-accent-text/80 hover:decoration-accent-text/50"
					{...props}
				>
					{children}
				</a>
			);
		},

		// ── Block quotes ─────────────────────────────────────────────────────
		blockquote({ children, ...props }: React.ComponentProps<"blockquote"> & ExtraProps) {
			return (
				<blockquote
					className="my-3 border-l-2 border-border-primary pl-4 text-text-secondary italic"
					{...props}
				>
					{children}
				</blockquote>
			);
		},

		// ── Tables (GFM) ─────────────────────────────────────────────────────
		table({ children, ...props }: React.ComponentProps<"table"> & ExtraProps) {
			return (
				<div className="my-3 overflow-x-auto">
					<table className="w-full border-collapse text-sm" {...props}>
						{children}
					</table>
				</div>
			);
		},

		thead({ children, ...props }: React.ComponentProps<"thead"> & ExtraProps) {
			return (
				<thead className="border-b border-border-primary" {...props}>
					{children}
				</thead>
			);
		},

		th({ children, ...props }: React.ComponentProps<"th"> & ExtraProps) {
			return (
				<th className="px-3 py-2 text-left font-semibold text-text-secondary" {...props}>
					{children}
				</th>
			);
		},

		td({ children, ...props }: React.ComponentProps<"td"> & ExtraProps) {
			return (
				<td className="border-t border-border-secondary px-3 py-2 text-text-secondary" {...props}>
					{children}
				</td>
			);
		},

		// ── Horizontal rule ──────────────────────────────────────────────────
		hr(props: React.ComponentProps<"hr"> & ExtraProps) {
			return <hr className="my-4 border-border-secondary" {...props} />;
		},

		// ── Strong/emphasis ──────────────────────────────────────────────────
		strong({ children, ...props }: React.ComponentProps<"strong"> & ExtraProps) {
			return (
				<strong className="font-semibold text-text-primary" {...props}>
					{children}
				</strong>
			);
		},

		em({ children, ...props }: React.ComponentProps<"em"> & ExtraProps) {
			return (
				<em className="italic text-text-secondary" {...props}>
					{children}
				</em>
			);
		},

		// ── Strikethrough (GFM) ──────────────────────────────────────────────
		del({ children, ...props }: React.ComponentProps<"del"> & ExtraProps) {
			return (
				<del className="text-text-tertiary line-through" {...props}>
					{children}
				</del>
			);
		},

		// ── Images ───────────────────────────────────────────────────────────
		img({ src, alt }: React.ComponentProps<"img"> & ExtraProps) {
			return (
				<img
					src={src}
					alt={alt || "Image"}
					className={cn(
						"my-3 max-w-full rounded-lg border border-border-secondary",
						onImageClick && "cursor-pointer transition-opacity hover:opacity-80",
					)}
					loading="lazy"
					onClick={
						onImageClick && src
							? (e: MouseEvent<HTMLImageElement>) => {
									e.preventDefault();
									onImageClick(src, alt || "Image");
								}
							: undefined
					}
					onKeyDown={undefined}
				/>
			);
		},
	};
}

// ============================================================================
// Public component
// ============================================================================

interface MarkdownProps {
	/** Markdown content string. */
	content: string;
	/** Optional additional className for the wrapper. */
	className?: string;
	/** Working directory for resolving relative file path links. */
	cwd?: string | undefined;
}

/**
 * Render markdown content with syntax highlighting and dark theme styling.
 *
 * Supports GFM (tables, strikethrough, task lists, autolinks).
 * Fenced code blocks are highlighted with Shiki via CodeBlock component.
 * Images are clickable and open in a full-size preview modal.
 * File path links (absolute, relative, file://) open in the user's code editor.
 * External URLs open in a new browser tab.
 */
export function MarkdownContent({ content, className, cwd }: MarkdownProps) {
	const setImagePreview = useStore((s) => s.setImagePreview);

	const handleImageClick = useCallback(
		(src: string, alt: string) => {
			setImagePreview(src, alt);
		},
		[setImagePreview],
	);

	const components = useMemo(
		() => createComponents(handleImageClick, cwd),
		[handleImageClick, cwd],
	);

	return (
		<div className={cn("markdown-content space-y-3 break-words", className)}>
			<ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
				{content}
			</ReactMarkdown>
		</div>
	);
}
