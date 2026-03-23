/**
 * File utilities — helpers for working with file paths and extensions.
 *
 * Used by tool-specific renderers to determine syntax highlighting language
 * from file paths in tool arguments.
 *
 * @module
 */

/** Map of file extensions to Shiki language identifiers. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	// JavaScript / TypeScript
	js: "javascript",
	jsx: "jsx",
	ts: "typescript",
	tsx: "tsx",
	mjs: "javascript",
	mts: "typescript",
	cjs: "javascript",
	cts: "typescript",

	// Web
	html: "html",
	htm: "html",
	css: "css",
	scss: "scss",
	less: "less",
	svg: "xml",
	vue: "vue",
	svelte: "svelte",

	// Data / Config
	json: "json",
	jsonc: "jsonc",
	json5: "json5",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	xml: "xml",
	csv: "csv",
	env: "shellscript",

	// Scripting
	sh: "shellscript",
	bash: "shellscript",
	zsh: "shellscript",
	fish: "shellscript",
	ps1: "powershell",
	bat: "bat",
	cmd: "bat",

	// Systems
	rs: "rust",
	go: "go",
	c: "c",
	h: "c",
	cpp: "cpp",
	cc: "cpp",
	cxx: "cpp",
	hpp: "cpp",
	cs: "csharp",
	java: "java",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	zig: "zig",

	// Python / Ruby / PHP
	py: "python",
	pyi: "python",
	rb: "ruby",
	php: "php",
	lua: "lua",
	r: "r",
	pl: "perl",

	// Docs / Markup
	md: "markdown",
	mdx: "mdx",
	tex: "latex",
	rst: "markdown",

	// Config files
	ini: "ini",
	conf: "ini",
	cfg: "ini",
	properties: "properties",
	dockerfile: "dockerfile",

	// Misc
	sql: "sql",
	graphql: "graphql",
	gql: "graphql",
	proto: "proto",
	diff: "diff",
	patch: "diff",
	makefile: "makefile",
};

/** Filename-based matches for files without extensions. */
const FILENAME_TO_LANGUAGE: Record<string, string> = {
	Dockerfile: "dockerfile",
	Makefile: "makefile",
	Vagrantfile: "ruby",
	Gemfile: "ruby",
	Rakefile: "ruby",
	Justfile: "makefile",
	".gitignore": "shellscript",
	".gitattributes": "shellscript",
	".env": "shellscript",
	".env.local": "shellscript",
	".env.example": "shellscript",
	".npmrc": "ini",
	".editorconfig": "ini",
};

/**
 * Extract the filename from a file path (last segment after `/`).
 */
export function getFileName(path: string): string {
	const segments = path.split("/");
	return segments[segments.length - 1] ?? path;
}

/**
 * Extract the file extension from a path (lowercase, without dot).
 * Returns empty string if no extension.
 */
export function getFileExtension(path: string): string {
	const filename = getFileName(path);
	const dotIndex = filename.lastIndexOf(".");
	if (dotIndex <= 0) return "";
	return filename.slice(dotIndex + 1).toLowerCase();
}

/**
 * Infer a Shiki language identifier from a file path.
 * Checks extension first, then full filename. Falls back to empty string.
 */
export function inferLanguageFromPath(path: string): string {
	const ext = getFileExtension(path);
	if (ext && ext in EXTENSION_TO_LANGUAGE) {
		return EXTENSION_TO_LANGUAGE[ext] ?? "";
	}

	const filename = getFileName(path);
	if (filename in FILENAME_TO_LANGUAGE) {
		return FILENAME_TO_LANGUAGE[filename] ?? "";
	}

	return "";
}

/**
 * Get a short display name for a file path.
 * Shows the filename and parent directory if available.
 *
 * Examples:
 * - "/Users/foo/project/src/index.ts" → "src/index.ts"
 * - "index.ts" → "index.ts"
 * - "/a/b/c/d/e.ts" → "d/e.ts"
 */
export function shortPath(path: string): string {
	const segments = path.split("/").filter((s) => s.length > 0);
	if (segments.length <= 2) return segments.join("/");
	return segments.slice(-2).join("/");
}
