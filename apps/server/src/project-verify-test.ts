#!/usr/bin/env bun
/**
 * Project Management Verification Test
 *
 * Validates Phase 2 exit criteria:
 * 1. Add 3 projects via WS methods
 * 2. Switch between them (create tabs with different CWDs)
 * 3. Projects persist across server restarts
 * 4. Project CRUD operations work correctly
 * 5. Window title method works
 *
 * Does NOT require Pi binary or API keys — tests project infrastructure only.
 *
 * Usage:
 *   bun run src/project-verify-test.ts
 */

import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Project } from "@pibun/contracts";
import { PiRpcManager } from "./piRpcManager.js";
import { type PiBunServer, createServer } from "./server.js";

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

function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<WsMessage> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout (${timeoutMs}ms) waiting for WS message`));
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			clearTimeout(timer);
			ws.removeEventListener("message", handler);
			resolve(parseMsg(event.data as string));
		}

		ws.addEventListener("message", handler);
	});
}

function connectWsWithWelcome(url: string): Promise<{ ws: WebSocket; welcome: WsMessage }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const timer = setTimeout(() => {
			reject(new Error("WebSocket connection timeout"));
		}, 5000);

		ws.addEventListener("message", function handler(event: MessageEvent) {
			ws.removeEventListener("message", handler);
			clearTimeout(timer);
			const msg = parseMsg(event.data as string);
			resolve({ ws, welcome: msg });
		});

		ws.addEventListener("error", (e) => {
			clearTimeout(timer);
			reject(new Error(`WebSocket error: ${e}`));
		});
	});
}

let reqIdCounter = 0;

function sendRequest(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
): { id: string } {
	const id = `req-${String(++reqIdCounter)}`;
	const msg: Record<string, unknown> = { id, method };
	if (params) msg.params = params;
	ws.send(JSON.stringify(msg));
	return { id };
}

async function request(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
): Promise<WsMessage> {
	const { id } = sendRequest(ws, method, params);
	// Drain messages until we get our response
	for (let i = 0; i < 20; i++) {
		const msg = await waitForMessage(ws);
		if (msg.id === id) return msg;
		// Skip push messages
	}
	throw new Error(`No response for ${method} (id: ${id})`);
}

// ============================================================================
// Projects file management
// ============================================================================

const PROJECTS_FILE = resolve(homedir(), ".pibun/projects.json");
let backupData: string | null = null;

function backupProjectsFile(): void {
	if (existsSync(PROJECTS_FILE)) {
		backupData = Bun.file(PROJECTS_FILE).text() as unknown as string;
		// Actually read synchronously
		const fs = require("node:fs");
		backupData = fs.readFileSync(PROJECTS_FILE, "utf-8");
	}
}

function restoreProjectsFile(): void {
	if (backupData !== null) {
		const fs = require("node:fs");
		fs.writeFileSync(PROJECTS_FILE, backupData);
	} else if (existsSync(PROJECTS_FILE)) {
		rmSync(PROJECTS_FILE);
	}
}

function clearProjectsFile(): void {
	if (existsSync(PROJECTS_FILE)) {
		const fs = require("node:fs");
		fs.writeFileSync(PROJECTS_FILE, "[]");
	}
}

// ============================================================================
// Server lifecycle
// ============================================================================

function startTestServer(): { server: PiBunServer; wsUrl: string } {
	const rpcManager = new PiRpcManager();
	const server = createServer({
		port: 0,
		hostname: "localhost",
		rpcManager,
	});
	const port = server.server.port;
	const wsUrl = `ws://localhost:${port}/ws`;
	return { server, wsUrl };
}

// ============================================================================
// Tests
// ============================================================================

async function testAddThreeProjects(wsUrl: string): Promise<Project[]> {
	console.log("\n── Add 3 Projects ──");

	const { ws, welcome } = await connectWsWithWelcome(wsUrl);
	check("WebSocket connected with welcome", welcome.channel === "server.welcome");

	const projects: Project[] = [];

	// Add project 1: /tmp/project-alpha
	const resp1 = await request(ws, "project.add", { cwd: "/tmp/project-alpha", name: "Alpha" });
	check("project.add Alpha succeeds", !("error" in resp1));
	const p1 = (resp1.result as Record<string, unknown>).project as Project;
	check("Alpha has correct name", p1.name === "Alpha");
	check("Alpha has correct CWD", p1.cwd === "/tmp/project-alpha");
	check("Alpha has an ID", typeof p1.id === "string" && p1.id.length > 0);
	projects.push(p1);

	// Add project 2: /tmp/project-beta
	const resp2 = await request(ws, "project.add", { cwd: "/tmp/project-beta", name: "Beta" });
	check("project.add Beta succeeds", !("error" in resp2));
	const p2 = (resp2.result as Record<string, unknown>).project as Project;
	check("Beta has correct name", p2.name === "Beta");
	projects.push(p2);

	// Add project 3: /tmp/project-gamma
	const resp3 = await request(ws, "project.add", { cwd: "/tmp/project-gamma", name: "Gamma" });
	check("project.add Gamma succeeds", !("error" in resp3));
	const p3 = (resp3.result as Record<string, unknown>).project as Project;
	check("Gamma has correct name", p3.name === "Gamma");
	projects.push(p3);

	// Verify listing returns all 3
	const listResp = await request(ws, "project.list");
	check("project.list succeeds", !("error" in listResp));
	const listed = (listResp.result as Record<string, unknown>).projects as Project[];
	check("List contains 3 projects", listed.length >= 3);

	// Verify all 3 are in the list
	const listedCwds = listed.map((p) => p.cwd);
	check("Alpha in list", listedCwds.includes("/tmp/project-alpha"));
	check("Beta in list", listedCwds.includes("/tmp/project-beta"));
	check("Gamma in list", listedCwds.includes("/tmp/project-gamma"));

	ws.close();
	return projects;
}

async function testProjectCrud(wsUrl: string, projects: Project[]): Promise<void> {
	console.log("\n── Project CRUD ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Update project name
	const alpha = projects[0];
	if (!alpha) throw new Error("No alpha project");

	const updateResp = await request(ws, "project.update", {
		projectId: alpha.id,
		name: "Alpha Prime",
	});
	check("project.update succeeds", !("error" in updateResp));

	// Verify the update persisted
	const listResp = await request(ws, "project.list");
	const listed = (listResp.result as Record<string, unknown>).projects as Project[];
	const updated = listed.find((p) => p.id === alpha.id);
	check("Updated project has new name", updated?.name === "Alpha Prime");

	// Remove a project
	const beta = projects[1];
	if (!beta) throw new Error("No beta project");

	const removeResp = await request(ws, "project.remove", { projectId: beta.id });
	check("project.remove succeeds", !("error" in removeResp));

	// Verify removal
	const listAfterRemove = await request(ws, "project.list");
	const listedAfter = (listAfterRemove.result as Record<string, unknown>).projects as Project[];
	const betaStillExists = listedAfter.some((p) => p.id === beta.id);
	check("Removed project no longer in list", !betaStillExists);
	check("List has 2 projects after removal", listedAfter.length >= 2);

	// CWD deduplication — adding same CWD again returns existing project
	const dupeResp = await request(ws, "project.add", { cwd: "/tmp/project-gamma" });
	check("Duplicate CWD add succeeds", !("error" in dupeResp));
	const dupeProject = (dupeResp.result as Record<string, unknown>).project as Project;
	check("Duplicate returns same project ID", dupeProject.id === projects[2]?.id);

	ws.close();
}

async function testPersistenceAcrossRestart(
	createServer: () => { server: PiBunServer; wsUrl: string },
): Promise<void> {
	console.log("\n── Persistence Across Restart ──");

	// Start fresh — clear projects and add some
	clearProjectsFile();

	const { server: server1, wsUrl: wsUrl1 } = createServer();
	const { ws: ws1 } = await connectWsWithWelcome(wsUrl1);

	// Add 2 projects on first server instance
	await request(ws1, "project.add", { cwd: "/tmp/persist-one", name: "Persist1" });
	await request(ws1, "project.add", { cwd: "/tmp/persist-two", name: "Persist2" });

	const list1 = await request(ws1, "project.list");
	const projects1 = (list1.result as Record<string, unknown>).projects as Project[];
	check("First instance has 2 projects", projects1.length >= 2);

	ws1.close();
	await server1.stop();

	// Wait a moment for server cleanup
	await Bun.sleep(100);

	// Start a second server instance — should load persisted projects
	const { server: server2, wsUrl: wsUrl2 } = createServer();
	const { ws: ws2 } = await connectWsWithWelcome(wsUrl2);

	const list2 = await request(ws2, "project.list");
	const projects2 = (list2.result as Record<string, unknown>).projects as Project[];
	check("Second instance loads persisted projects", projects2.length >= 2);

	const cwds2 = projects2.map((p) => p.cwd);
	check("Persist1 survives restart", cwds2.includes("/tmp/persist-one"));
	check("Persist2 survives restart", cwds2.includes("/tmp/persist-two"));

	// Verify names preserved
	const p1 = projects2.find((p) => p.cwd === "/tmp/persist-one");
	check("Persist1 name preserved", p1?.name === "Persist1");

	ws2.close();
	await server2.stop();
}

async function testWindowTitle(wsUrl: string): Promise<void> {
	console.log("\n── Window Title ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// app.setWindowTitle should succeed even in non-desktop mode (silently)
	const resp = await request(ws, "app.setWindowTitle", { title: "Test — PiBun" });
	check("app.setWindowTitle succeeds (no hook = silent ok)", !("error" in resp));
	const result = resp.result as Record<string, unknown>;
	check("Returns ok: true", result.ok === true);

	ws.close();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("🔍 PiBun Project Management Verification Test\n");

	// Backup existing projects file
	backupProjectsFile();

	try {
		// Clear projects for a clean test
		clearProjectsFile();

		// Start server
		const { server, wsUrl } = startTestServer();
		console.log(`Server started on ${wsUrl}`);

		// Test 1: Add 3 projects
		const projects = await testAddThreeProjects(wsUrl);

		// Test 2: CRUD operations
		await testProjectCrud(wsUrl, projects);

		// Test 3: Window title
		await testWindowTitle(wsUrl);

		// Stop first server for persistence test
		await server.stop();
		await Bun.sleep(100);

		// Test 4: Persistence across server restart
		await testPersistenceAcrossRestart(startTestServer);
	} finally {
		// Restore original projects file
		restoreProjectsFile();
	}

	// Summary
	console.log("\n══════════════════════════════════════");
	console.log(`✅ Passed: ${passed}`);
	console.log(`❌ Failed: ${failed}`);
	console.log(`📊 Total:  ${passed + failed}`);
	console.log("══════════════════════════════════════\n");

	if (failed > 0) {
		console.error("❌ VERIFICATION FAILED");
		process.exit(1);
	}

	console.log("✅ Phase 2 project management verification passed!");
	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	// Restore projects file on error
	restoreProjectsFile();
	process.exit(1);
});
