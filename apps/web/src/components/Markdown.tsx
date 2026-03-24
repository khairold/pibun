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
import { cn } from "@/lib/cn";
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

/**
 * Custom component overrides for react-markdown.
 * These render markdown elements with our Tailwind dark theme styles.
 */
const components: Components = {
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
				className="my-3 max-w-full rounded-lg border border-border-secondary"
				loading="lazy"
			/>
		);
	},
};

// ============================================================================
// Public component
// ============================================================================

interface MarkdownProps {
	/** Markdown content string. */
	content: string;
	/** Optional additional className for the wrapper. */
	className?: string;
}

/**
 * Render markdown content with syntax highlighting and dark theme styling.
 *
 * Supports GFM (tables, strikethrough, task lists, autolinks).
 * Fenced code blocks are highlighted with Shiki via CodeBlock component.
 */
export function MarkdownContent({ content, className }: MarkdownProps) {
	return (
		<div className={cn("markdown-content space-y-3 break-words", className)}>
			<ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
				{content}
			</ReactMarkdown>
		</div>
	);
}
