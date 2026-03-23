/**
 * Minimal className utility — joins class name segments, filtering out falsy values.
 *
 * Usage:
 * ```typescript
 * cn("flex", isActive && "bg-blue-500", className)
 * // → "flex bg-blue-500" (if isActive is true)
 * ```
 */
export function cn(...inputs: (string | false | null | undefined)[]): string {
	return inputs.filter(Boolean).join(" ");
}
