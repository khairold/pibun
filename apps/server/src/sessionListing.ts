/**
 * Session listing — reads Pi session files from the file system.
 *
 * Pi stores sessions at `~/.pi/agent/sessions/{cwd-encoded}/`.
 * Each session is a JSONL file whose first line is a `{"type":"session",...}` header
 * containing the session ID, timestamp, and CWD.
 *
 * This module provides a server-side listing function since Pi's RPC protocol
 * has no `list_sessions` command.
 */

import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WsSessionSummary } from "@pibun/contracts";

/** Pi sessions root directory. */
const PI_SESSIONS_ROOT = join(homedir(), ".pi", "agent", "sessions");

/**
 * Session header — the first line of a Pi session JSONL file.
 * Only the fields we need for listing.
 */
interface SessionHeader {
	type: "session";
	id: string;
	timestamp: string;
	cwd: string;
	name?: string;
}

/**
 * Read the first line of a file and parse it as JSON.
 *
 * Uses `Bun.file().slice()` to read only the first 4KB — efficient for
 * large session files (no full read). The session header line is always
 * well under 4KB. Avoids `ReadableStream` async iteration which has type
 * compatibility issues across different tsconfig `lib` settings.
 *
 * Returns null if the file can't be read or parsed.
 */
async function readFirstLine(filePath: string): Promise<SessionHeader | null> {
	try {
		const file = Bun.file(filePath);
		// Read first 4KB — more than enough for the session header line
		const slice = file.slice(0, 4096);
		const text = await slice.text();

		const newlineIdx = text.indexOf("\n");
		const firstLine =
			newlineIdx !== -1 ? text.slice(0, newlineIdx).replace(/\r$/, "") : text.trim();

		if (!firstLine) return null;

		const parsed: unknown = JSON.parse(firstLine);
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			"type" in parsed &&
			(parsed as { type: string }).type === "session"
		) {
			return parsed as SessionHeader;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Encode a CWD path to Pi's session directory name format.
 *
 * Pi encodes the CWD by replacing `/` with `-` and prepending/appending `--`.
 * e.g., `/Users/foo/bar` → `--Users-foo-bar--`
 */
function encodeCwdToDirName(cwd: string): string {
	return `--${cwd.split("/").filter(Boolean).join("-")}--`;
}

/**
 * List all sessions for a given working directory.
 *
 * Reads `~/.pi/agent/sessions/{cwd-encoded}/` and parses each JSONL file's
 * header line to extract session metadata.
 *
 * Returns sessions sorted by creation time (newest first).
 */
export async function listSessions(cwd?: string): Promise<WsSessionSummary[]> {
	const sessions: WsSessionSummary[] = [];

	try {
		if (cwd) {
			// List sessions for a specific CWD
			const dirName = encodeCwdToDirName(cwd);
			const dirPath = join(PI_SESSIONS_ROOT, dirName);
			const cwdSessions = await listSessionsInDir(dirPath);
			sessions.push(...cwdSessions);
		} else {
			// List sessions across all CWDs
			const cwdDirs = await readdir(PI_SESSIONS_ROOT, { withFileTypes: true });
			for (const dir of cwdDirs) {
				if (dir.isDirectory()) {
					const dirPath = join(PI_SESSIONS_ROOT, dir.name);
					const cwdSessions = await listSessionsInDir(dirPath);
					sessions.push(...cwdSessions);
				}
			}
		}
	} catch {
		// Sessions directory may not exist yet — return empty list
	}

	// Sort newest first
	sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

	return sessions;
}

/**
 * List sessions in a single CWD directory.
 */
async function listSessionsInDir(dirPath: string): Promise<WsSessionSummary[]> {
	const sessions: WsSessionSummary[] = [];

	try {
		const files = await readdir(dirPath);
		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;

			const filePath = join(dirPath, file);
			const header = await readFirstLine(filePath);
			if (!header) continue;

			sessions.push({
				sessionPath: filePath,
				sessionId: header.id,
				createdAt: header.timestamp,
				name: header.name ?? null,
				cwd: header.cwd,
			});
		}
	} catch {
		// Directory may not exist or be unreadable — skip
	}

	return sessions;
}
