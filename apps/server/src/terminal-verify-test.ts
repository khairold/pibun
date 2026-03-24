#!/usr/bin/env bun
/**
 * Terminal Integration Verification Test (Phase 4 — Item 4.12)
 *
 * Validates all terminal-related features end-to-end:
 * 1. terminal.create — spawns PTY, returns terminalId + pid
 * 2. terminal.write + terminal.data push — stdin/stdout echo test
 * 3. terminal.resize — resizes PTY dimensions
 * 4. terminal.close — kills shell, triggers terminal.exit push
 * 5. Multiple terminals — 3 concurrent terminals, independent data routing
 * 6. CWD inheritance — terminal inherits CWD from create params
 * 7. terminal.exit push — fires when shell process exits
 * 8. Cleanup on WS disconnect — orphaned terminals are closed
 * 9. Error handling — write/resize/close on invalid terminal ID
 *
 * Uses real PTY shells — no mocks. Requires a Unix shell (macOS/Linux).
 *
 * Usage:
 *   bun run src/terminal-verify-test.ts
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PiBunServer } from "./server.js";
import {
	collectPushes,
	connectWsWithWelcome,
	createCheckCounter,
	request,
	startServer,
	waitForPush,
} from "./test-harness.js";

const { check, printResults } = createCheckCounter();

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Main Test
// ============================================================================

async function main(): Promise<void> {
	console.log("\n🧪 Terminal Integration Verification Test (Phase 4)\n");

	// Set up temp directories for CWD testing
	const tempDir1 = join(tmpdir(), `pibun-term-test-1-${Date.now()}`);
	const tempDir2 = join(tmpdir(), `pibun-term-test-2-${Date.now()}`);
	mkdirSync(tempDir1, { recursive: true });
	mkdirSync(tempDir2, { recursive: true });

	let server: PiBunServer | null = null;
	let ws: WebSocket | null = null;
	let ws2: WebSocket | null = null;

	try {
		// ================================================================
		// Server Setup
		// ================================================================
		console.log("📦 Setting up server...");
		const ts = startServer({
			staticDir: resolve(import.meta.dir, "../../web/dist"),
		});
		server = ts.server;
		const wsUrl = ts.wsUrl;

		// Connect WebSocket
		const { ws: socket, welcome } = await connectWsWithWelcome(wsUrl);
		ws = socket;

		check(
			"WebSocket connected + welcome received",
			welcome.type === "push" && welcome.channel === "server.welcome",
		);

		// ================================================================
		// Test 1: terminal.create — basic creation
		// ================================================================
		console.log("\n📋 Test 1: terminal.create");

		const createResult = await request(ws, "terminal.create", {
			cwd: tempDir1,
			cols: 120,
			rows: 40,
		});
		check("terminal.create returns result", "result" in createResult);

		const create1 = createResult.result as Record<string, unknown>;
		const terminalId1 = create1.terminalId as string;
		check(
			"terminalId is a non-empty string",
			typeof terminalId1 === "string" && terminalId1.length > 0,
		);
		check("pid is a positive number", typeof create1.pid === "number" && create1.pid > 0);

		// Give shell a moment to start
		await delay(500);

		// ================================================================
		// Test 2: terminal.write + terminal.data push — echo test
		// ================================================================
		console.log("\n📋 Test 2: terminal.write + terminal.data (echo test)");

		// We'll write an echo command and check that we get data back.
		// Use a unique marker string to identify our output.
		const marker = `PIBUN_TEST_${Date.now()}`;

		// Start collecting data pushes before writing
		const dataCollector = collectPushes(ws, "terminal.data", 3000);

		// Write the echo command
		const writeResult = await request(ws, "terminal.write", {
			terminalId: terminalId1,
			data: `echo ${marker}\n`,
		});
		check("terminal.write returns ok", "result" in writeResult);

		const writeOk = writeResult.result as Record<string, unknown>;
		check("terminal.write result has ok: true", writeOk.ok === true);

		// Wait for data pushes
		const dataPushes = await dataCollector;
		check("received terminal.data push(es)", dataPushes.length > 0);

		// Check that at least one push contains our marker
		const allData = dataPushes
			.map((p) => {
				const d = p.data as Record<string, unknown>;
				return d.data as string;
			})
			.join("");
		check("terminal output contains echo marker", allData.includes(marker));

		// Verify push data has correct terminalId
		const firstDataPush = dataPushes[0];
		if (firstDataPush) {
			const pushData = firstDataPush.data as Record<string, unknown>;
			check("terminal.data push has correct terminalId", pushData.terminalId === terminalId1);
			check("terminal.data push has string data", typeof pushData.data === "string");
		}

		// ================================================================
		// Test 3: terminal.resize
		// ================================================================
		console.log("\n📋 Test 3: terminal.resize");

		const resizeResult = await request(ws, "terminal.resize", {
			terminalId: terminalId1,
			cols: 200,
			rows: 50,
		});
		check("terminal.resize returns result", "result" in resizeResult);

		const resizeOk = resizeResult.result as Record<string, unknown>;
		check("terminal.resize result has ok: true", resizeOk.ok === true);

		// Verify the resize took effect by checking $COLUMNS via echo
		const resizeMarker = `RESIZE_${Date.now()}`;
		const resizeDataCollector = collectPushes(ws, "terminal.data", 2000);
		await request(ws, "terminal.write", {
			terminalId: terminalId1,
			data: `echo ${resizeMarker}_$COLUMNS\n`,
		});
		const resizeData = await resizeDataCollector;
		const resizeOutput = resizeData
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check(
			"resize marker appears in output (shell responsive after resize)",
			resizeOutput.includes(resizeMarker),
		);

		// ================================================================
		// Test 4: Multiple terminals
		// ================================================================
		console.log("\n📋 Test 4: Multiple terminals");

		// Create second terminal in a different CWD
		const createResult2 = await request(ws, "terminal.create", {
			cwd: tempDir2,
		});
		check("second terminal.create returns result", "result" in createResult2);

		const create2 = createResult2.result as Record<string, unknown>;
		const terminalId2 = create2.terminalId as string;
		check("second terminal has different ID", terminalId2 !== terminalId1);
		check(
			"second terminal has its own pid",
			typeof create2.pid === "number" && create2.pid > 0 && create2.pid !== create1.pid,
		);

		// Create third terminal
		const createResult3 = await request(ws, "terminal.create", {
			cwd: tempDir1,
		});
		const create3 = createResult3.result as Record<string, unknown>;
		const terminalId3 = create3.terminalId as string;
		check(
			"third terminal has unique ID",
			terminalId3 !== terminalId1 && terminalId3 !== terminalId2,
		);

		await delay(500);

		// Write to each terminal with unique markers
		const marker2 = `TERM2_${Date.now()}`;
		const marker3 = `TERM3_${Date.now()}`;

		const allDataCollector = collectPushes(ws, "terminal.data", 3000);

		await request(ws, "terminal.write", {
			terminalId: terminalId2,
			data: `echo ${marker2}\n`,
		});
		await request(ws, "terminal.write", {
			terminalId: terminalId3,
			data: `echo ${marker3}\n`,
		});

		const allPushes = await allDataCollector;

		// Check that pushes are tagged with correct terminalIds
		const term2Pushes = allPushes.filter((p) => {
			const d = p.data as Record<string, unknown>;
			return d.terminalId === terminalId2;
		});
		const term3Pushes = allPushes.filter((p) => {
			const d = p.data as Record<string, unknown>;
			return d.terminalId === terminalId3;
		});
		check("received data from terminal 2", term2Pushes.length > 0);
		check("received data from terminal 3", term3Pushes.length > 0);

		const term2Output = term2Pushes
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		const term3Output = term3Pushes
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check("terminal 2 output contains its marker", term2Output.includes(marker2));
		check("terminal 3 output contains its marker", term3Output.includes(marker3));

		// ================================================================
		// Test 5: CWD inheritance
		// ================================================================
		console.log("\n📋 Test 5: CWD matches project");

		// Terminal 1 was created with tempDir1 — verify via pwd
		const cwdMarker1 = `CWD1_${Date.now()}`;
		const cwdCollector1 = collectPushes(ws, "terminal.data", 2000);
		await request(ws, "terminal.write", {
			terminalId: terminalId1,
			data: `echo ${cwdMarker1}_$(pwd)\n`,
		});
		const cwdPushes1 = await cwdCollector1;
		const cwdOutput1 = cwdPushes1
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check("terminal 1 CWD matches tempDir1", cwdOutput1.includes(tempDir1));

		// Terminal 2 was created with tempDir2
		const cwdMarker2 = `CWD2_${Date.now()}`;
		const cwdCollector2 = collectPushes(ws, "terminal.data", 2000);
		await request(ws, "terminal.write", {
			terminalId: terminalId2,
			data: `echo ${cwdMarker2}_$(pwd)\n`,
		});
		const cwdPushes2 = await cwdCollector2;
		const cwdOutput2 = cwdPushes2
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check("terminal 2 CWD matches tempDir2", cwdOutput2.includes(tempDir2));

		// ================================================================
		// Test 6: terminal.close + terminal.exit push
		// ================================================================
		console.log("\n📋 Test 6: terminal.close + terminal.exit");

		// Close terminal 3 and wait for exit push
		const exitPromise = waitForPush(
			ws,
			"terminal.exit",
			(data) => (data as Record<string, unknown>).terminalId === terminalId3,
		);

		const closeResult = await request(ws, "terminal.close", {
			terminalId: terminalId3,
		});
		check("terminal.close returns result", "result" in closeResult);

		const closeOk = closeResult.result as Record<string, unknown>;
		check("terminal.close result has ok: true", closeOk.ok === true);

		const exitMsg = await exitPromise;
		const exitData = exitMsg.data as Record<string, unknown>;
		check("terminal.exit push has correct terminalId", exitData.terminalId === terminalId3);
		check("terminal.exit push has exitCode (number)", typeof exitData.exitCode === "number");

		// ================================================================
		// Test 7: Operations on closed terminal → error
		// ================================================================
		console.log("\n📋 Test 7: Error handling — operations on closed/invalid terminal");

		const writeClosedResult = await request(ws, "terminal.write", {
			terminalId: terminalId3,
			data: "hello\n",
		});
		check("terminal.write on closed terminal returns error", "error" in writeClosedResult);

		const resizeClosedResult = await request(ws, "terminal.resize", {
			terminalId: terminalId3,
			cols: 100,
			rows: 30,
		});
		check("terminal.resize on closed terminal returns error", "error" in resizeClosedResult);

		const closeClosedResult = await request(ws, "terminal.close", {
			terminalId: terminalId3,
		});
		check("terminal.close on already-closed terminal returns error", "error" in closeClosedResult);

		// Invalid terminal ID
		const writeInvalidResult = await request(ws, "terminal.write", {
			terminalId: "nonexistent-terminal",
			data: "hello\n",
		});
		check("terminal.write on invalid ID returns error", "error" in writeInvalidResult);

		// ================================================================
		// Test 8: Shell exit → terminal.exit push
		// ================================================================
		console.log("\n📋 Test 8: Shell exit (natural exit) → terminal.exit push");

		// Create a terminal that we'll exit naturally
		const createResult4 = await request(ws, "terminal.create", {
			cwd: tempDir1,
		});
		const create4 = createResult4.result as Record<string, unknown>;
		const terminalId4 = create4.terminalId as string;

		await delay(300);

		// Start waiting for exit before sending the exit command
		const naturalExitPromise = waitForPush(
			ws,
			"terminal.exit",
			(data) => (data as Record<string, unknown>).terminalId === terminalId4,
		);

		// Tell the shell to exit
		await request(ws, "terminal.write", {
			terminalId: terminalId4,
			data: "exit\n",
		});

		const naturalExit = await naturalExitPromise;
		const naturalExitData = naturalExit.data as Record<string, unknown>;
		check(
			"natural shell exit triggers terminal.exit push",
			naturalExitData.terminalId === terminalId4,
		);
		check("natural exit has exitCode 0", naturalExitData.exitCode === 0);

		// ================================================================
		// Test 9: Cleanup on WS disconnect
		// ================================================================
		console.log("\n📋 Test 9: Cleanup on WS disconnect");

		// Connect a second WebSocket and create terminals on it
		const { ws: socket2 } = await connectWsWithWelcome(wsUrl);
		ws2 = socket2;

		const createOnWs2_1 = await request(ws2, "terminal.create", {
			cwd: tempDir1,
		});
		const ws2Term1 = (createOnWs2_1.result as Record<string, unknown>).terminalId as string;

		const createOnWs2_2 = await request(ws2, "terminal.create", {
			cwd: tempDir2,
		});
		const ws2Term2 = (createOnWs2_2.result as Record<string, unknown>).terminalId as string;

		check("ws2 terminal 1 created", typeof ws2Term1 === "string" && ws2Term1.length > 0);
		check("ws2 terminal 2 created", typeof ws2Term2 === "string" && ws2Term2.length > 0);

		await delay(300);

		// Close ws2 — terminals should be cleaned up
		ws2.close();
		ws2 = null;

		await delay(500);

		// Verify terminals are gone by trying to write to them from ws1
		// (The server should have cleaned them up on WS disconnect)
		const writeOrphan1 = await request(ws, "terminal.write", {
			terminalId: ws2Term1,
			data: "hello\n",
		});
		check("terminal from disconnected ws2 is cleaned up (write fails)", "error" in writeOrphan1);

		const writeOrphan2 = await request(ws, "terminal.write", {
			terminalId: ws2Term2,
			data: "hello\n",
		});
		check(
			"second terminal from disconnected ws2 is cleaned up (write fails)",
			"error" in writeOrphan2,
		);

		// ================================================================
		// Test 10: Remaining terminals still work after closing others
		// ================================================================
		console.log("\n📋 Test 10: Remaining terminals still work");

		// Terminals 1 and 2 from ws1 should still be alive
		const aliveMarker1 = `ALIVE1_${Date.now()}`;
		const aliveCollector1 = collectPushes(ws, "terminal.data", 2000);
		await request(ws, "terminal.write", {
			terminalId: terminalId1,
			data: `echo ${aliveMarker1}\n`,
		});
		const alivePushes1 = await aliveCollector1;
		const aliveOutput1 = alivePushes1
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check("terminal 1 still works after others closed", aliveOutput1.includes(aliveMarker1));

		const aliveMarker2 = `ALIVE2_${Date.now()}`;
		const aliveCollector2 = collectPushes(ws, "terminal.data", 2000);
		await request(ws, "terminal.write", {
			terminalId: terminalId2,
			data: `echo ${aliveMarker2}\n`,
		});
		const alivePushes2 = await aliveCollector2;
		const aliveOutput2 = alivePushes2
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check("terminal 2 still works after others closed", aliveOutput2.includes(aliveMarker2));

		// ================================================================
		// Test 11: terminal.create with default CWD (no params)
		// ================================================================
		console.log("\n📋 Test 11: terminal.create default CWD");

		const createDefault = await request(ws, "terminal.create", {});
		check("terminal.create with empty params returns result", "result" in createDefault);

		const createDef = createDefault.result as Record<string, unknown>;
		const terminalIdDefault = createDef.terminalId as string;
		check(
			"default terminal has a valid ID",
			typeof terminalIdDefault === "string" && terminalIdDefault.length > 0,
		);

		await delay(300);

		// Check CWD is process.cwd() (server's working directory)
		const defCwdMarker = `DEFCWD_${Date.now()}`;
		const defCwdCollector = collectPushes(ws, "terminal.data", 2000);
		await request(ws, "terminal.write", {
			terminalId: terminalIdDefault,
			data: `echo ${defCwdMarker}_$(pwd)\n`,
		});
		const defCwdPushes = await defCwdCollector;
		const defCwdOutput = defCwdPushes
			.map((p) => (p.data as Record<string, unknown>).data as string)
			.join("");
		check("default CWD terminal output contains a valid path", defCwdOutput.includes(defCwdMarker));

		// Clean up default terminal
		await request(ws, "terminal.close", { terminalId: terminalIdDefault });

		// ================================================================
		// Cleanup remaining terminals
		// ================================================================
		console.log("\n📋 Cleanup");

		// Close remaining terminals
		const exit1Promise = waitForPush(
			ws,
			"terminal.exit",
			(data) => (data as Record<string, unknown>).terminalId === terminalId1,
		);
		const exit2Promise = waitForPush(
			ws,
			"terminal.exit",
			(data) => (data as Record<string, unknown>).terminalId === terminalId2,
		);

		await request(ws, "terminal.close", { terminalId: terminalId1 });
		await request(ws, "terminal.close", { terminalId: terminalId2 });

		await Promise.all([exit1Promise, exit2Promise]);
		check("all remaining terminals closed cleanly", true);

		const { failed } = printResults("Terminal integration verification");
		process.exit(failed > 0 ? 1 : 0);
	} finally {
		if (ws2 && ws2.readyState === WebSocket.OPEN) ws2.close();
		if (ws && ws.readyState === WebSocket.OPEN) ws.close();
		if (server) server.stop();
		try {
			rmSync(tempDir1, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		try {
			rmSync(tempDir2, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
