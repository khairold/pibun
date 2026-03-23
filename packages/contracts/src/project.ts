/**
 * @pibun/contracts — Project types
 *
 * A project is a directory that the user works in frequently.
 * Projects persist across app restarts and remember CWD, model preferences,
 * and session history. Types-only, zero runtime code.
 */

import type { PiThinkingLevel } from "./piTypes.js";

// ============================================================================
// Project
// ============================================================================

/** Model preference for a project — provider + model ID pair. */
export interface ProjectModelPreference {
	provider: string;
	modelId: string;
}

/**
 * A project directory entry.
 *
 * Projects are persisted to `~/.pibun/projects.json` on the server.
 * The web app manages them via `project.*` WS methods.
 */
export interface Project {
	/** Unique project ID (server-generated UUID). */
	id: string;
	/** Display name (defaults to directory basename, user-editable). */
	name: string;
	/** Absolute path to the project directory. */
	cwd: string;
	/** Unix timestamp (ms) of last time this project was opened/used. */
	lastOpened: number;
	/** Preferred model for new sessions in this project, null if no preference. */
	favoriteModel: ProjectModelPreference | null;
	/** Preferred thinking level for new sessions, null if no preference. */
	defaultThinking: PiThinkingLevel | null;
	/** Number of sessions historically started in this project. */
	sessionCount: number;
}
