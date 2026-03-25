/**
 * Configurable keybinding system.
 *
 * Parses key strings (e.g., "mod+shift+k") into structured shortcuts,
 * resolves keydown events against binding rules, evaluates `when`
 * conditions, and manages the default + user-override binding list.
 *
 * Key concepts:
 * - `mod` = Cmd on macOS, Ctrl on others (the "platform modifier")
 * - Rules are matched last-to-first (later rules override earlier ones)
 * - `when` clauses are simple boolean expressions: identifiers, `!`, `&&`, `||`
 * - User rules from `~/.pibun/keybindings.json` are appended after defaults,
 *   so they take precedence
 *
 * @module
 */

import type { KeybindingCommand, KeybindingRule } from "@pibun/contracts";

// ============================================================================
// Types
// ============================================================================

/** Parsed shortcut — the structured form of a key string. */
export interface ParsedShortcut {
	key: string;
	modKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}

/** A resolved binding — parsed and ready to match against events. */
export interface ResolvedBinding {
	command: KeybindingCommand;
	shortcut: ParsedShortcut;
	whenAst: WhenNode | null;
}

/** Boolean expression AST for `when` clauses. */
export type WhenNode =
	| { type: "identifier"; name: string }
	| { type: "not"; node: WhenNode }
	| { type: "and"; left: WhenNode; right: WhenNode }
	| { type: "or"; left: WhenNode; right: WhenNode };

/** Context values available in `when` clause evaluation. */
export interface WhenContext {
	terminalFocus: boolean;
	terminalOpen: boolean;
	streaming: boolean;
	hasSession: boolean;
	isConnected: boolean;
	[key: string]: boolean;
}

// ============================================================================
// Platform detection
// ============================================================================

const IS_MAC =
	typeof navigator !== "undefined" &&
	(/mac/i.test(navigator.platform) || /macintosh/i.test(navigator.userAgent));

// ============================================================================
// Key string parsing
// ============================================================================

function normalizeKeyToken(token: string): string {
	if (token === "space") return " ";
	if (token === "esc") return "escape";
	if (token === "backquote" || token === "backtick") return "`";
	if (token === "backslash") return "\\";
	return token;
}

/**
 * Parse a key string like "mod+shift+k" into a ParsedShortcut.
 * Returns null if the string is malformed.
 */
export function parseKeyString(value: string): ParsedShortcut | null {
	const rawTokens = value
		.toLowerCase()
		.split("+")
		.map((t) => t.trim());

	// Handle trailing "+" (the key IS "+")
	const tokens = [...rawTokens];
	let trailingEmpty = 0;
	while (tokens.length > 0 && tokens[tokens.length - 1] === "") {
		trailingEmpty++;
		tokens.pop();
	}
	if (trailingEmpty > 0) {
		tokens.push("+");
	}

	if (tokens.length === 0 || tokens.some((t) => t.length === 0)) {
		return null;
	}

	let key: string | null = null;
	let modKey = false;
	let ctrlKey = false;
	let shiftKey = false;
	let altKey = false;
	let metaKey = false;

	for (const token of tokens) {
		switch (token) {
			case "mod":
				modKey = true;
				break;
			case "ctrl":
			case "control":
				ctrlKey = true;
				break;
			case "shift":
				shiftKey = true;
				break;
			case "alt":
			case "option":
				altKey = true;
				break;
			case "cmd":
			case "meta":
				metaKey = true;
				break;
			default:
				if (key !== null) return null; // multiple non-modifier keys
				key = normalizeKeyToken(token);
		}
	}

	if (key === null) return null;
	return { key, modKey, ctrlKey, shiftKey, altKey, metaKey };
}

// ============================================================================
// When clause parsing (simple recursive descent)
// ============================================================================

type WhenToken =
	| { type: "identifier"; value: string }
	| { type: "not" }
	| { type: "and" }
	| { type: "or" }
	| { type: "lparen" }
	| { type: "rparen" };

function tokenizeWhen(expression: string): WhenToken[] | null {
	const tokens: WhenToken[] = [];
	let i = 0;

	while (i < expression.length) {
		const ch = expression[i];
		if (!ch) break;

		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (expression.startsWith("&&", i)) {
			tokens.push({ type: "and" });
			i += 2;
			continue;
		}
		if (expression.startsWith("||", i)) {
			tokens.push({ type: "or" });
			i += 2;
			continue;
		}
		if (ch === "!") {
			tokens.push({ type: "not" });
			i++;
			continue;
		}
		if (ch === "(") {
			tokens.push({ type: "lparen" });
			i++;
			continue;
		}
		if (ch === ")") {
			tokens.push({ type: "rparen" });
			i++;
			continue;
		}

		const match = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(expression.slice(i));
		if (!match) return null;
		tokens.push({ type: "identifier", value: match[0] });
		i += match[0].length;
	}

	return tokens;
}

function parseWhenExpression(expression: string): WhenNode | null {
	const rawTokens = tokenizeWhen(expression);
	if (!rawTokens || rawTokens.length === 0) return null;
	// Reassign to a non-nullable const so nested closures see the narrowed type
	const tokens: WhenToken[] = rawTokens;
	let idx = 0;

	function parsePrimary(): WhenNode | null {
		const token = tokens[idx];
		if (!token) return null;

		if (token.type === "identifier") {
			idx++;
			return { type: "identifier", name: token.value };
		}
		if (token.type === "lparen") {
			idx++;
			const node = parseOr();
			if (!node || tokens[idx]?.type !== "rparen") return null;
			idx++;
			return node;
		}
		return null;
	}

	function parseUnary(): WhenNode | null {
		let notCount = 0;
		while (tokens[idx]?.type === "not") {
			idx++;
			notCount++;
		}
		let node = parsePrimary();
		if (!node) return null;
		while (notCount > 0) {
			node = { type: "not", node };
			notCount--;
		}
		return node;
	}

	function parseAnd(): WhenNode | null {
		let left = parseUnary();
		if (!left) return null;
		while (tokens[idx]?.type === "and") {
			idx++;
			const right = parseUnary();
			if (!right) return null;
			left = { type: "and", left, right };
		}
		return left;
	}

	function parseOr(): WhenNode | null {
		let left = parseAnd();
		if (!left) return null;
		while (tokens[idx]?.type === "or") {
			idx++;
			const right = parseAnd();
			if (!right) return null;
			left = { type: "or", left, right };
		}
		return left;
	}

	const ast = parseOr();
	if (!ast || idx !== tokens.length) return null;
	return ast;
}

// ============================================================================
// When clause evaluation
// ============================================================================

function evaluateWhen(node: WhenNode, context: WhenContext): boolean {
	switch (node.type) {
		case "identifier":
			if (node.name === "true") return true;
			if (node.name === "false") return false;
			return Boolean(context[node.name]);
		case "not":
			return !evaluateWhen(node.node, context);
		case "and":
			return evaluateWhen(node.left, context) && evaluateWhen(node.right, context);
		case "or":
			return evaluateWhen(node.left, context) || evaluateWhen(node.right, context);
	}
}

// ============================================================================
// Event matching
// ============================================================================

function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
	const key = event.key.toLowerCase();
	if (key !== shortcut.key) return false;

	const expectedMeta = shortcut.metaKey || (shortcut.modKey && IS_MAC);
	const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !IS_MAC);

	return (
		event.metaKey === expectedMeta &&
		event.ctrlKey === expectedCtrl &&
		event.shiftKey === shortcut.shiftKey &&
		event.altKey === shortcut.altKey
	);
}

/**
 * Resolve which command a keydown event should trigger.
 *
 * Iterates bindings in reverse order (last wins) and returns the first
 * matching command whose `when` clause evaluates to true.
 *
 * @returns The command string, or null if no binding matches.
 */
export function resolveCommand(
	event: KeyboardEvent,
	bindings: readonly ResolvedBinding[],
	context: WhenContext,
): KeybindingCommand | null {
	for (let i = bindings.length - 1; i >= 0; i--) {
		const binding = bindings[i];
		if (!binding) continue;
		if (!matchesShortcut(event, binding.shortcut)) continue;
		if (binding.whenAst && !evaluateWhen(binding.whenAst, context)) continue;
		return binding.command;
	}
	return null;
}

// ============================================================================
// Rule compilation
// ============================================================================

/**
 * Compile a `KeybindingRule` into a `ResolvedBinding`.
 * Returns null if the key string is malformed.
 */
export function compileRule(rule: KeybindingRule): ResolvedBinding | null {
	const shortcut = parseKeyString(rule.key);
	if (!shortcut) return null;

	const whenAst = rule.when ? parseWhenExpression(rule.when) : null;
	// If there's a `when` string but parsing failed, skip the rule (malformed)
	if (rule.when && !whenAst) return null;

	return { command: rule.command, shortcut, whenAst };
}

/**
 * Compile an array of rules into resolved bindings.
 * Silently skips malformed rules.
 */
export function compileRules(rules: readonly KeybindingRule[]): ResolvedBinding[] {
	const resolved: ResolvedBinding[] = [];
	for (const rule of rules) {
		const compiled = compileRule(rule);
		if (compiled) {
			resolved.push(compiled);
		}
	}
	return resolved;
}

// ============================================================================
// Default keybindings
// ============================================================================

/**
 * Built-in default keybindings.
 * These match the previously hardcoded shortcuts in `useKeyboardShortcuts`.
 * User rules from `~/.pibun/keybindings.json` are appended after these
 * (and override via last-match-wins).
 */
export const DEFAULT_KEYBINDINGS: readonly KeybindingRule[] = [
	// Content tab navigation (mod+1 = chat, mod+2-9 = terminal tabs by position)
	{ key: "mod+1", command: "contentTab1" },
	{ key: "mod+2", command: "contentTab2" },
	{ key: "mod+3", command: "contentTab3" },
	{ key: "mod+4", command: "contentTab4" },
	{ key: "mod+5", command: "contentTab5" },
	{ key: "mod+6", command: "contentTab6" },
	{ key: "mod+7", command: "contentTab7" },
	{ key: "mod+8", command: "contentTab8" },
	{ key: "mod+9", command: "contentTab9" },
	// Non-shift combos
	{ key: "mod+c", command: "abort" },
	{ key: "mod+b", command: "toggleSidebar" },
	{ key: "mod+d", command: "toggleDiffPanel" },
	{ key: "mod+g", command: "toggleGitPanel" },
	{ key: "mod+l", command: "toggleModelSelector" },
	{ key: "mod+m", command: "cycleModel" },
	{ key: "mod+n", command: "newSession" },
	{ key: "mod+,", command: "settings" },
	{ key: "mod+j", command: "toggleTerminal" },
	// Shift combos
	{ key: "mod+shift+b", command: "toggleBashInput" },
	{ key: "mod+shift+c", command: "copyLastResponse" },
	{ key: "mod+shift+e", command: "toggleExportDialog" },
	{ key: "mod+shift+k", command: "compact" },
	{ key: "mod+shift+m", command: "cycleThinking" },
	{ key: "mod+shift+p", command: "togglePluginManager" },
	{ key: "mod+shift+t", command: "toggleThinkingSelector" },
];

// ============================================================================
// Binding manager — merges defaults + user overrides
// ============================================================================

/** Pre-compiled default bindings. */
const DEFAULT_RESOLVED = compileRules(DEFAULT_KEYBINDINGS);

/** Current merged resolved bindings (defaults + user overrides). */
let activeBindings: readonly ResolvedBinding[] = DEFAULT_RESOLVED;

/** Current user rules (raw, for display in settings). */
let userRules: readonly KeybindingRule[] = [];

/**
 * Get the currently active resolved bindings.
 */
export function getActiveBindings(): readonly ResolvedBinding[] {
	return activeBindings;
}

/**
 * Get the current user-defined rules (for display in settings).
 */
export function getUserRules(): readonly KeybindingRule[] {
	return userRules;
}

/**
 * Set user override rules. Compiles them and merges with defaults.
 * User rules are appended after defaults, so they take precedence
 * via last-match-wins.
 */
export function setUserKeybindings(rules: readonly KeybindingRule[]): void {
	userRules = rules;
	const userResolved = compileRules(rules);
	activeBindings = [...DEFAULT_RESOLVED, ...userResolved];
}

/**
 * Reset to defaults only (no user overrides).
 */
export function resetKeybindings(): void {
	userRules = [];
	activeBindings = DEFAULT_RESOLVED;
}

// ============================================================================
// Display helpers
// ============================================================================

/**
 * Format a ParsedShortcut as a human-readable label.
 * Mac: uses symbols (⌘, ⇧, ⌥, ⌃). Others: uses "Ctrl+Shift+Alt+".
 */
export function formatShortcutLabel(shortcut: ParsedShortcut): string {
	const key = formatKeyLabel(shortcut.key);

	if (IS_MAC) {
		const ctrl = shortcut.ctrlKey ? "⌃" : "";
		const alt = shortcut.altKey ? "⌥" : "";
		const shift = shortcut.shiftKey ? "⇧" : "";
		const cmd = shortcut.metaKey || shortcut.modKey ? "⌘" : "";
		return `${ctrl}${alt}${shift}${cmd}${key}`;
	}

	const parts: string[] = [];
	if (shortcut.ctrlKey || shortcut.modKey) parts.push("Ctrl");
	if (shortcut.altKey) parts.push("Alt");
	if (shortcut.shiftKey) parts.push("Shift");
	if (shortcut.metaKey) parts.push("Meta");
	parts.push(key);
	return parts.join("+");
}

function formatKeyLabel(key: string): string {
	if (key === " ") return "Space";
	if (key === "`") return "`";
	if (key === "\\") return "\\";
	if (key === "escape") return "Esc";
	if (key === "tab") return "Tab";
	if (key === "arrowup") return "↑";
	if (key === "arrowdown") return "↓";
	if (key === "arrowleft") return "←";
	if (key === "arrowright") return "→";
	if (key.length === 1) return key.toUpperCase();
	return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Get the display label for a command's current binding.
 * Returns the label for the LAST matching binding (highest priority).
 */
export function labelForCommand(command: KeybindingCommand): string | null {
	const bindings = getActiveBindings();
	for (let i = bindings.length - 1; i >= 0; i--) {
		const binding = bindings[i];
		if (binding && binding.command === command) {
			return formatShortcutLabel(binding.shortcut);
		}
	}
	return null;
}
