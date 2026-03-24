/**
 * @pibun/contracts — Shared TypeScript types (no runtime logic)
 *
 * Re-exports all type definitions from three domain files:
 * - piProtocol.ts — Pi RPC types (events, commands, responses, base types)
 * - domain.ts — App domain types (session tabs, projects, themes, settings, plugins, git)
 * - wsProtocol.ts — WebSocket protocol types (browser ↔ server messages)
 *
 * This package has ZERO runtime code — only interfaces, types, type aliases,
 * and const value objects (WS_METHODS, WS_CHANNELS).
 */

export type * from "./piProtocol.js";
export type * from "./domain.js";
export * from "./wsProtocol.js";
