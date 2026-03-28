/**
 * Shell environment resolution for desktop apps.
 *
 * macOS desktop apps launched from Dock/Finder inherit a minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`). Tools installed via nvm, Homebrew,
 * or other shell-configured managers won't be found.
 *
 * This module spawns the user's login shell to extract the real PATH
 * and merges it into `process.env`. Call once at startup, before any
 * subprocess spawning (server start, Pi CLI detection, etc.).
 *
 * Standard approach — VS Code, Cursor, and other desktop apps do the same.
 */

/**
 * Detect the user's default shell.
 * Falls back to `/bin/zsh` (macOS default since Catalina).
 */
function detectShell(): string {
	return process.env.SHELL || "/bin/zsh";
}

/**
 * Spawn a login shell and extract environment variables.
 *
 * Runs `env -0` inside a login+interactive shell to get null-delimited
 * key=value pairs. This picks up everything from ~/.zshrc, ~/.bashrc,
 * ~/.nvm/nvm.sh, etc.
 *
 * @returns Map of environment variable name → value, or null on failure.
 */
function extractShellEnv(): Record<string, string> | null {
	const shell = detectShell();

	try {
		// -l = login shell (reads profile), -i = interactive (reads rc files)
		// -c = run command. `env -0` outputs null-delimited env vars.
		// Timeout after 5s — if the shell hangs on some interactive prompt, bail.
		const result = Bun.spawnSync([shell, "-l", "-i", "-c", "env -0"], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
			timeout: 5_000,
		});

		if (result.exitCode !== 0) {
			// Retry without -i (some shells hang on interactive mode)
			const retryResult = Bun.spawnSync([shell, "-l", "-c", "env -0"], {
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env },
				timeout: 5_000,
			});

			if (retryResult.exitCode !== 0) {
				console.warn(`[ShellEnv] Login shell exited with code ${String(retryResult.exitCode)}`);
				return null;
			}

			return parseNullDelimitedEnv(retryResult.stdout.toString());
		}

		return parseNullDelimitedEnv(result.stdout.toString());
	} catch (err) {
		console.warn("[ShellEnv] Failed to spawn login shell:", err);
		return null;
	}
}

/**
 * Parse null-delimited `env -0` output into a key-value map.
 */
function parseNullDelimitedEnv(raw: string): Record<string, string> {
	const env: Record<string, string> = {};
	const entries = raw.split("\0");

	for (const entry of entries) {
		const eqIndex = entry.indexOf("=");
		if (eqIndex > 0) {
			const key = entry.slice(0, eqIndex);
			const value = entry.slice(eqIndex + 1);
			env[key] = value;
		}
	}

	return env;
}

/**
 * Resolve the user's real shell environment and merge it into `process.env`.
 *
 * Call this once at desktop app startup, before starting the embedded server
 * or spawning any subprocesses. No-op if the environment already looks complete
 * (e.g., when running from a terminal).
 *
 * Only runs on macOS and Linux — Windows desktop apps inherit PATH correctly.
 *
 * @returns true if PATH was updated, false if skipped or failed.
 */
export function resolveShellEnv(): boolean {
	// Only needed on macOS/Linux
	if (process.platform === "win32") {
		return false;
	}

	const currentPath = process.env.PATH ?? "";

	// Heuristic: if PATH already contains common user-installed tool dirs,
	// we're probably running from a terminal and don't need to fix anything.
	const hasUserPaths =
		currentPath.includes("/.nvm/") ||
		currentPath.includes("/homebrew/") ||
		currentPath.includes("/usr/local/bin") ||
		currentPath.includes("/.bun/");

	if (hasUserPaths) {
		console.log("[ShellEnv] PATH already contains user paths, skipping resolution");
		return false;
	}

	console.log("[ShellEnv] Resolving shell environment...");
	console.log(`[ShellEnv] Current PATH: ${currentPath}`);

	const shellEnv = extractShellEnv();

	if (!shellEnv || !shellEnv.PATH) {
		console.warn("[ShellEnv] Could not extract PATH from login shell");
		return false;
	}

	// Merge the shell's PATH into process.env.
	// Use the shell's PATH wholesale — it's authoritative.
	process.env.PATH = shellEnv.PATH;
	console.log(`[ShellEnv] Resolved PATH: ${shellEnv.PATH}`);

	return true;
}
