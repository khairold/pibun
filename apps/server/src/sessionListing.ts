/**
 * Session listing — reads Pi session files from the file system.
 *
 * Pi stores sessions at `~/.pi/agent/sessions/{cwd-encoded}/`.
 * Each session is a JSONL file. The first line is a `{"type":"session",...}` header.
 * Subsequent lines include messages and session_info entries.
 *
 * We scan the file to extract:
 * - Session header (id, timestamp, cwd)
 * - Session name from `session_info` entries (latest wins)
 * - First user message text (for display when no name is set)
 * - Message count
 *
 * This mirrors Pi's own session-manager.ts `parseSessionFile()` logic.
 */

import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WsSessionSummary } from "@pibun/contracts";

/** Pi sessions root directory. */
const PI_SESSIONS_ROOT = join(homedir(), ".pi", "agent", "sessions");

/**
 * Session header — the first line of a Pi session JSONL file.
 */
interface SessionHeader {
	type: "session";
	id: string;
	timestamp: string;
	cwd: string;
}

/** A session_info entry that may contain a name. */
interface SessionInfoEntry {
	type: "session_info";
	name?: string;
}

/** A message entry wrapping a Pi message. */
interface SessionMessageEntry {
	type: "message";
	message: {
		role: string;
		content?: string | readonly { type: string; text?: string }[];
	};
}

/** Parsed JSONL entry (loosely typed for scanning). */
type SessionEntry = { type: string; [key: string]: unknown };

/**
 * Extract text content from a user message's content field.
 * Handles both string content and content block arrays.
 */
function extractUserText(content: string | readonly { type: string; text?: string }[]): string {
	if (typeof content === "string") return content;
	return content
		.filter((b) => b.type === "text" && b.text)
		.map((b) => b.text as string)
		.join("");
}

/**
 * Parse a session JSONL file and extract summary metadata.
 *
 * Reads the full file and scans all entries for:
 * - The header (first line)
 * - session_info entries (latest name wins)
 * - First user message text
 * - Message count
 *
 * Returns null if the file can't be read or has no valid header.
 */
async function parseSessionFile(filePath: string): Promise<WsSessionSummary | null> {
	try {
		const text = await Bun.file(filePath).text();
		const lines = text.split("\n");

		let header: SessionHeader | null = null;
		let name: string | undefined;
		let firstMessage: string | null = null;
		let messageCount = 0;

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			let entry: SessionEntry;
			try {
				entry = JSON.parse(trimmed) as SessionEntry;
			} catch {
				continue;
			}

			// Header — must be the first valid entry
			if (entry.type === "session" && !header) {
				header = entry as unknown as SessionHeader;
				continue;
			}

			// Session info — extract name (latest wins)
			if (entry.type === "session_info") {
				const info = entry as unknown as SessionInfoEntry;
				name = info.name?.trim() || undefined;
				continue;
			}

			// Messages — count and extract first user message
			if (entry.type === "message") {
				messageCount++;
				const msgEntry = entry as unknown as SessionMessageEntry;
				if (!firstMessage && msgEntry.message?.role === "user" && msgEntry.message.content) {
					const text = extractUserText(msgEntry.message.content);
					if (text.trim()) {
						firstMessage = text.trim();
					}
				}
			}
		}

		if (!header) return null;

		return {
			sessionPath: filePath,
			sessionId: header.id,
			createdAt: header.timestamp,
			name: name ?? null,
			cwd: header.cwd,
			firstMessage,
			messageCount,
		};
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
 * Reads `~/.pi/agent/sessions/{cwd-encoded}/` and parses each JSONL file
 * to extract session metadata including name and first message.
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
			const summary = await parseSessionFile(filePath);
			if (summary) {
				sessions.push(summary);
			}
		}
	} catch {
		// Directory may not exist or be unreadable — skip
	}

	return sessions;
}
