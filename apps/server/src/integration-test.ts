#!/usr/bin/env bun

/**
 * Manual integration test for Phase 1A.
 *
 * Spawns a real Pi RPC process via PiRpcManager, sends a prompt,
 * and logs all streaming events to the console.
 *
 * Usage:
 *   bun run apps/server/src/integration-test.ts
 *
 * Requires:
 *   - `pi` installed and on PATH (v0.61.1+)
 *   - API key configured (e.g., ANTHROPIC_API_KEY)
 *
 * Uses a cheap model/thinking configuration to minimize API costs.
 */

import type { PiEvent, PiResponse } from "@pibun/contracts";
import { PiRpcManager } from "./piRpcManager.js";

// ============================================================================
// Configuration
// ============================================================================

const TEST_PROMPT = "Respond with exactly one word: hello";
const PROVIDER = "anthropic";
const MODEL = "sonnet";
const THINKING = "low" as const;
const TIMEOUT_MS = 60_000; // 60s overall timeout

// ============================================================================
// Helpers
// ============================================================================

function log(prefix: string, ...args: unknown[]): void {
	const ts = new Date().toISOString().slice(11, 23);
	console.log(`[${ts}] ${prefix}`, ...args);
}

function logEvent(event: PiEvent): void {
	const { type, ...rest } = event;
	const detail = Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : "";
	log("📨 EVENT", type, detail ? `\n${detail}` : "");
}

function logResponse(response: PiResponse): void {
	log("📩 RESPONSE", JSON.stringify(response));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	log("🚀", "Starting integration test...");
	log("⚙️", `Config: provider=${PROVIDER} model=${MODEL} thinking=${THINKING}`);

	const manager = new PiRpcManager();

	// Track session events
	manager.onSessionEvent((sessionId, event) => {
		log("🔔 SESSION", sessionId, JSON.stringify(event));
	});

	// Create session — spawns Pi process
	log("📦", "Creating session...");
	const session = manager.createSession({
		provider: PROVIDER,
		model: MODEL,
		thinking: THINKING,
		noSession: true, // ephemeral — don't persist session files
	});
	log("✅", `Session created: ${session.id} (PID: ${session.process.pid})`);

	// Wire up event/response/stderr listeners
	session.process.onEvent(logEvent);
	session.process.onResponse(logResponse);
	session.process.onStderr((data) => {
		log("⚠️ STDERR", data.trim());
	});
	session.process.onError((error) => {
		log("❌ ERROR", error.message);
	});

	// Step 1: Verify connectivity with get_state (no API cost)
	log("🔍", "Sending get_state command...");
	try {
		const stateResp = await session.process.sendCommand({ type: "get_state" });
		if (stateResp.success && stateResp.command === "get_state") {
			log("✅", "get_state succeeded:", JSON.stringify(stateResp.data, null, 2));
		} else if (!stateResp.success) {
			log("❌", "get_state failed:", stateResp.error);
			await cleanup(manager);
			process.exit(1);
		}
	} catch (error) {
		log("❌", `get_state error: ${error instanceof Error ? error.message : String(error)}`);
		await cleanup(manager);
		process.exit(1);
	}

	// Step 2: Send a prompt and stream events
	log("💬", `Sending prompt: "${TEST_PROMPT}"`);

	// Create a promise that resolves when agent_end fires
	const agentDone = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Timeout: agent did not finish within ${TIMEOUT_MS}ms`));
		}, TIMEOUT_MS);

		session.process.onEvent((event) => {
			if (event.type === "agent_end") {
				clearTimeout(timer);
				resolve();
			}
		});

		session.process.onExit((code) => {
			clearTimeout(timer);
			reject(new Error(`Pi process exited unexpectedly (code: ${code})`));
		});
	});

	// Send the prompt command (message is a string, not content blocks)
	try {
		const promptResp = await session.process.sendCommand({
			type: "prompt",
			message: TEST_PROMPT,
		});
		log("📩", "prompt response:", JSON.stringify(promptResp));

		if (!promptResp.success) {
			log("❌", "Prompt failed:", promptResp.error);
			await cleanup(manager);
			process.exit(1);
		}
	} catch (error) {
		log("❌", `Prompt error: ${error instanceof Error ? error.message : String(error)}`);
		await cleanup(manager);
		process.exit(1);
	}

	// Wait for streaming to complete
	log("⏳", "Waiting for agent to finish...");
	try {
		await agentDone;
		log("✅", "Agent completed successfully!");
	} catch (error) {
		log("❌", `Agent error: ${error instanceof Error ? error.message : String(error)}`);
	}

	// Step 3: Clean up
	await cleanup(manager);
	log("🏁", "Integration test complete.");
}

async function cleanup(manager: PiRpcManager): Promise<void> {
	log("🧹", "Stopping all sessions...");
	await manager.stopAll();
	log("✅", "All sessions stopped.");
}

// Run
main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
