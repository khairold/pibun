#!/usr/bin/env bun
/**
 * Git Integration Verification Test (Phase 3 — Item 3.10)
 *
 * Validates all git-related features end-to-end:
 * 1. git.status — branch name, changed files, isDirty flag, isRepo detection
 * 2. git.branch — current branch name
 * 3. git.diff — unified diff output for specific files
 * 4. git.log — recent commit history
 * 5. Non-git directory returns isRepo: false
 * 6. File changes detected after modifications
 * 7. Staged vs unstaged diff support
 *
 * Uses a temporary git repository — no external deps or API keys needed.
 *
 * Usage:
 *   bun run src/git-integration-test.ts
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PiRpcManager } from "./piRpcManager.js";
import { type PiBunServer, createServer } from "./server.js";

// ============================================================================
// Constants
// ============================================================================

const TIMEOUT_MS = 10000;

// ============================================================================
// Helpers
// ============================================================================

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
	if (condition) {
		passed++;
		console.log(`  ✅ ${label}`);
	} else {
		failed++;
		console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

interface WsMessage {
	id?: string;
	type?: string;
	channel?: string;
	result?: Record<string, unknown>;
	error?: { message: string };
	data?: unknown;
}

function parseMsg(data: string | Buffer | ArrayBuffer): WsMessage {
	const raw = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
	return JSON.parse(raw) as WsMessage;
}

/**
 * Connect and wait for the server.welcome push.
 */
function connectWsWithWelcome(url: string): Promise<{ ws: WebSocket; welcome: WsMessage }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		let welcomeMsg: WsMessage | null = null;

		ws.addEventListener("message", (ev) => {
			if (!welcomeMsg) {
				welcomeMsg = parseMsg(ev.data);
				resolve({ ws, welcome: welcomeMsg });
			}
		});
		ws.addEventListener("open", () => {
			// Welcome should arrive shortly after open
		});
		ws.addEventListener("error", (e) => reject(e));
	});
}

/**
 * Send a request and wait for the correlated response.
 */
function sendRequest(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
): Promise<WsMessage> {
	const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`Timeout waiting for ${method}`)),
			TIMEOUT_MS,
		);

		const handler = (ev: MessageEvent) => {
			const msg = parseMsg(ev.data);
			if (msg.id === id) {
				clearTimeout(timeout);
				ws.removeEventListener("message", handler);
				resolve(msg);
			}
		};
		ws.addEventListener("message", handler);

		const payload: Record<string, unknown> = { id, method };
		if (params) payload.params = params;
		ws.send(JSON.stringify(payload));
	});
}

/**
 * Run a git command in a directory.
 */
function git(args: string[], cwd: string): void {
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		env: {
			...process.env,
			GIT_PAGER: "",
			GIT_AUTHOR_NAME: "Test",
			GIT_AUTHOR_EMAIL: "test@test.com",
			GIT_COMMITTER_NAME: "Test",
			GIT_COMMITTER_EMAIL: "test@test.com",
		},
	});
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
	}
}

/**
 * Create a temporary git repository with initial commit.
 */
function createTempGitRepo(): string {
	const dir = join(tmpdir(), `pibun-git-test-${Date.now()}`);
	mkdirSync(dir, { recursive: true });

	git(["init", "-b", "main"], dir);
	writeFileSync(join(dir, "README.md"), "# Test Project\n");
	git(["add", "."], dir);
	git(["commit", "-m", "Initial commit"], dir);

	return dir;
}

/**
 * Create a temp directory that is NOT a git repo.
 */
function createNonGitDir(): string {
	const dir = join(tmpdir(), `pibun-nongit-test-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "hello.txt"), "hello\n");
	return dir;
}

// ============================================================================
// Main Test
// ============================================================================

async function main(): Promise<void> {
	console.log("\n🧪 Git Integration Verification Test (Phase 3)\n");

	// Set up temp directories
	const gitDir = createTempGitRepo();
	const nonGitDir = createNonGitDir();

	let server: PiBunServer | null = null;
	let ws: WebSocket | null = null;

	try {
		// ================================================================
		// Server Setup
		// ================================================================
		console.log("📦 Setting up server...");
		const rpcManager = new PiRpcManager();
		const webDist = resolve(import.meta.dir, "../../web/dist");
		server = createServer({
			port: 0,
			hostname: "localhost",
			staticDir: webDist,
			rpcManager,
		});

		const port = server.server.port;
		const wsUrl = `ws://localhost:${port}/ws`;

		// Connect WebSocket
		const { ws: socket, welcome } = await connectWsWithWelcome(wsUrl);
		ws = socket;

		check(
			"WebSocket connected + welcome received",
			welcome.type === "push" && welcome.channel === "server.welcome",
		);

		// ================================================================
		// Test 1: git.status on a clean git repo
		// ================================================================
		console.log("\n📋 Test 1: git.status on clean repo");

		const statusClean = await sendRequest(ws, "git.status", { cwd: gitDir });
		check("git.status returns result", "result" in statusClean);

		const status1 = statusClean.result as Record<string, unknown>;
		const statusData1 = status1.status as Record<string, unknown>;
		check("isRepo is true", statusData1.isRepo === true);
		check("branch is 'main'", statusData1.branch === "main");
		check("isDirty is false (clean repo)", statusData1.isDirty === false);
		check(
			"files is empty array",
			Array.isArray(statusData1.files) && (statusData1.files as unknown[]).length === 0,
		);

		// ================================================================
		// Test 2: git.branch
		// ================================================================
		console.log("\n📋 Test 2: git.branch");

		const branchResult = await sendRequest(ws, "git.branch", { cwd: gitDir });
		check("git.branch returns result", "result" in branchResult);

		const branch1 = branchResult.result as Record<string, unknown>;
		check("branch is 'main'", branch1.branch === "main");

		// ================================================================
		// Test 3: git.log
		// ================================================================
		console.log("\n📋 Test 3: git.log");

		const logResult = await sendRequest(ws, "git.log", { cwd: gitDir });
		check("git.log returns result", "result" in logResult);

		const log1 = logResult.result as Record<string, unknown>;
		const logData = log1.log as Record<string, unknown>;
		const entries = logData.entries as Array<{ hash: string; message: string }>;
		check("log has 1 entry (initial commit)", entries.length === 1);
		check(
			"log entry has commit message 'Initial commit'",
			entries[0]?.message === "Initial commit",
		);
		check(
			"log entry has a hash",
			typeof entries[0]?.hash === "string" && entries[0].hash.length > 0,
		);

		// ================================================================
		// Test 4: Modify a file → status shows changes
		// ================================================================
		console.log("\n📋 Test 4: File modifications detected");

		writeFileSync(join(gitDir, "README.md"), "# Test Project\n\nModified content.\n");
		writeFileSync(join(gitDir, "newfile.ts"), "export const x = 42;\n");

		const statusDirty = await sendRequest(ws, "git.status", { cwd: gitDir });
		const status2 = statusDirty.result as Record<string, unknown>;
		const statusData2 = status2.status as Record<string, unknown>;
		check("isDirty is true after modifications", statusData2.isDirty === true);

		const files2 = statusData2.files as Array<{
			status: string;
			path: string;
			originalPath: string | null;
		}>;
		check("2 changed files detected", files2.length === 2);

		const readmeFile = files2.find((f) => f.path === "README.md");
		const newFile = files2.find((f) => f.path === "newfile.ts");
		check("README.md detected as modified", readmeFile?.status.includes("M") ?? false);
		check("newfile.ts detected as untracked", newFile?.status === "??");

		// ================================================================
		// Test 5: git.diff for modified file
		// ================================================================
		console.log("\n📋 Test 5: git.diff for specific file");

		const diffResult = await sendRequest(ws, "git.diff", { cwd: gitDir, path: "README.md" });
		check("git.diff returns result", "result" in diffResult);

		const diff1 = diffResult.result as Record<string, unknown>;
		const diffData = diff1.diff as Record<string, unknown>;
		const diffText = diffData.diff as string;
		check("diff contains README.md path", diffText.includes("README.md"));
		check("diff contains added line", diffText.includes("+Modified content"));
		check(
			"diff is unified format (has --- and +++ headers)",
			diffText.includes("---") && diffText.includes("+++"),
		);

		// ================================================================
		// Test 6: git.diff for staged changes
		// ================================================================
		console.log("\n📋 Test 6: Staged diff");

		git(["add", "README.md"], gitDir);
		const diffStaged = await sendRequest(ws, "git.diff", {
			cwd: gitDir,
			path: "README.md",
			staged: true,
		});
		const staged1 = diffStaged.result as Record<string, unknown>;
		const stagedDiffData = staged1.diff as Record<string, unknown>;
		const stagedDiffText = stagedDiffData.diff as string;
		check("staged diff contains README.md", stagedDiffText.includes("README.md"));
		check("staged diff shows the modification", stagedDiffText.includes("+Modified content"));

		// Unstaged diff should be empty for this file now
		const diffUnstaged = await sendRequest(ws, "git.diff", { cwd: gitDir, path: "README.md" });
		const unstaged1 = diffUnstaged.result as Record<string, unknown>;
		const unstagedDiffData = unstaged1.diff as Record<string, unknown>;
		const unstagedDiffText = unstagedDiffData.diff as string;
		check("unstaged diff is empty for fully-staged file", unstagedDiffText.trim() === "");

		// ================================================================
		// Test 7: Non-git directory
		// ================================================================
		console.log("\n📋 Test 7: Non-git directory");

		const statusNonGit = await sendRequest(ws, "git.status", { cwd: nonGitDir });
		const statusNG = statusNonGit.result as Record<string, unknown>;
		const statusDataNG = statusNG.status as Record<string, unknown>;
		check("isRepo is false for non-git directory", statusDataNG.isRepo === false);
		check("branch is null for non-git directory", statusDataNG.branch === null);
		check("isDirty is false for non-git directory", statusDataNG.isDirty === false);

		const branchNonGit = await sendRequest(ws, "git.branch", { cwd: nonGitDir });
		const branchNG = branchNonGit.result as Record<string, unknown>;
		check("git.branch returns null for non-git directory", branchNG.branch === null);

		// ================================================================
		// Test 8: git.diff on non-git directory → error
		// ================================================================
		console.log("\n📋 Test 8: Error handling");

		const diffNonGit = await sendRequest(ws, "git.diff", { cwd: nonGitDir });
		check("git.diff on non-git dir returns error", "error" in diffNonGit);

		const logNonGit = await sendRequest(ws, "git.log", { cwd: nonGitDir });
		check("git.log on non-git dir returns error", "error" in logNonGit);

		// ================================================================
		// Test 9: New branch detection
		// ================================================================
		console.log("\n📋 Test 9: Branch switching");

		git(["checkout", "-b", "feature-test"], gitDir);
		const branchAfterSwitch = await sendRequest(ws, "git.branch", { cwd: gitDir });
		const branchAS = branchAfterSwitch.result as Record<string, unknown>;
		check("branch reflects switch to 'feature-test'", branchAS.branch === "feature-test");

		const statusAfterSwitch = await sendRequest(ws, "git.status", { cwd: gitDir });
		const statusAS = statusAfterSwitch.result as Record<string, unknown>;
		const statusDataAS = statusAS.status as Record<string, unknown>;
		check("git.status also shows 'feature-test' branch", statusDataAS.branch === "feature-test");

		// ================================================================
		// Test 10: Commit and log update
		// ================================================================
		console.log("\n📋 Test 10: Commit + log update");

		git(["add", "."], gitDir);
		git(["commit", "-m", "Add changes on feature branch"], gitDir);

		const logAfterCommit = await sendRequest(ws, "git.log", { cwd: gitDir });
		const log2 = logAfterCommit.result as Record<string, unknown>;
		const logData2 = log2.log as Record<string, unknown>;
		const entries2 = logData2.entries as Array<{ hash: string; message: string }>;
		check("log now has 2 entries", entries2.length === 2);
		check(
			"latest commit message correct",
			entries2[0]?.message === "Add changes on feature branch",
		);
		check("initial commit still present", entries2[1]?.message === "Initial commit");

		// Status should be clean after commit
		const statusAfterCommit = await sendRequest(ws, "git.status", { cwd: gitDir });
		const statusAC = statusAfterCommit.result as Record<string, unknown>;
		const statusDataAC = statusAC.status as Record<string, unknown>;
		check("isDirty is false after commit", statusDataAC.isDirty === false);
		check(
			"files empty after commit",
			Array.isArray(statusDataAC.files) && (statusDataAC.files as unknown[]).length === 0,
		);

		// ================================================================
		// Test 11: Deleted file detection
		// ================================================================
		console.log("\n📋 Test 11: Deleted file detection");

		rmSync(join(gitDir, "newfile.ts"));

		const statusAfterDelete = await sendRequest(ws, "git.status", { cwd: gitDir });
		const statusAD = statusAfterDelete.result as Record<string, unknown>;
		const statusDataAD = statusAD.status as Record<string, unknown>;
		check("isDirty after file deletion", statusDataAD.isDirty === true);

		const filesAD = statusDataAD.files as Array<{ status: string; path: string }>;
		const deletedFile = filesAD.find((f) => f.path === "newfile.ts");
		check("deleted file detected with D status", deletedFile?.status.includes("D") ?? false);

		// ================================================================
		// Test 12: git.log with custom count
		// ================================================================
		console.log("\n📋 Test 12: git.log count parameter");

		const logLimited = await sendRequest(ws, "git.log", { cwd: gitDir, count: 1 });
		const logLim = logLimited.result as Record<string, unknown>;
		const logDataLim = logLim.log as Record<string, unknown>;
		const entriesLim = logDataLim.entries as Array<{ hash: string; message: string }>;
		check("log with count=1 returns 1 entry", entriesLim.length === 1);

		// ================================================================
		// Summary
		// ================================================================
		console.log(`\n${"=".repeat(50)}`);
		console.log(`\n🧪 Results: ${String(passed)}/${String(passed + failed)} checks passed\n`);

		if (failed > 0) {
			console.log("❌ VERIFICATION FAILED\n");
			process.exit(1);
		} else {
			console.log("✅ Phase 3 — Git Integration VERIFIED\n");
			console.log("Exit criteria validated:");
			console.log(
				"  ✅ Branch + dirty status visible (git.status returns isRepo, branch, isDirty, files)",
			);
			console.log(
				"  ✅ Changed files list accessible (git.status returns file list with status badges)",
			);
			console.log("  ✅ Diffs viewable (git.diff returns unified diff, staged/unstaged support)");
			console.log(
				"  ✅ Branch switching reflected (git.branch + git.status update after checkout)",
			);
			console.log("  ✅ File changes detected (modifications, new files, deletions)");
			console.log("  ✅ Commit history accessible (git.log with count parameter)");
			console.log("  ✅ Non-git directories handled gracefully (isRepo: false)");
			console.log("  ✅ Error handling for unsupported operations on non-git dirs");
		}
	} finally {
		// Cleanup
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.close();
		}
		if (server) {
			server.stop();
		}
		// Clean up temp dirs
		try {
			rmSync(gitDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		try {
			rmSync(nonGitDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
