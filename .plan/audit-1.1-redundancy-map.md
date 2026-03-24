# Redundancy Audit: Context Document Cross-References

> Produced by item 1.1. Maps every redundant statement across CLAUDE.md, AGENTS.md, CAPABILITY-MAP.md, SOUL.md, HUMAN.md, CONVENTIONS.md, and docs/*.

---

## Files Audited

| File | Location | Lines | Purpose |
|------|----------|-------|---------|
| CLAUDE.md | `/CLAUDE.md` | ~90 | Project identity, structure, commands, doc index |
| AGENTS.md | `.pi/AGENTS.md` | ~200 | Roles, playbooks, gap detection, meta-cognitive protocol |
| CAPABILITY-MAP.md | `.pi/CAPABILITY-MAP.md` | ~120 | Can/can't inventory, reference repo guides |
| SOUL.md | `.agents/SOUL.md` | ~50 | Personality, boundaries, working style |
| HUMAN.md | `.agents/HUMAN.md` | ~60 | Human context, preferences, anti-patterns |
| CONVENTIONS.md | `.agents/CONVENTIONS.md` | ~200 | Build patterns with ✅/❌ examples |
| TENSIONS.md | `.agents/TENSIONS.md` | ~40 | Friction log (living, append-only) |
| DECISIONS.md | `docs/DECISIONS.md` | ~100 | Architecture decisions, gotchas, technical context |
| ARCHITECTURE.md | `docs/ARCHITECTURE.md` | ~90 | System design, package roles |
| WS_PROTOCOL.md | `docs/WS_PROTOCOL.md` | ~100 | WebSocket message contract |
| PI_INTEGRATION.md | `docs/PI_INTEGRATION.md` | ~120 | Pi RPC protocol details |
| WEB_UI.md | `docs/WEB_UI.md` | ~130 | React app design, components, state |

**Total: 12 files, ~1300 lines of context docs**

---

## Redundancy Map

### 1. "Thin Bridge" Principle

Stated in **5 files**:

| File | Statement |
|------|-----------|
| CLAUDE.md | "Core principle: Pi handles state. The server is a thin bridge." |
| AGENTS.md | "Does Pi already do this?" — in Meta-Cognitive Protocol |
| SOUL.md | "Respect the thin bridge." — full paragraph explaining it |
| CONVENTIONS.md | "Architecture: The Thin Bridge Principle" — full section with ✅/❌ |
| DECISIONS.md | Decision #5: "Pi handles ALL state management internally" |
| ARCHITECTURE.md | "No orchestration engine... Pi handles session state... The server is a thin bridge." |
| PI_INTEGRATION.md | "What Pi Handles Internally" — entire section listing what NOT to implement |

**Verdict:** 7 restatements. Keep ONE authoritative version in CLAUDE.md, remove from all others.

### 2. Reference Repo Guidance

Stated in **4 files**:

| File | Content |
|------|---------|
| CLAUDE.md | Reference Repos table — 3 repos, 1-line descriptions |
| AGENTS.md | "Check reference" in playbooks |
| CAPABILITY-MAP.md | Full tables: "Key files to read by task" for all 3 repos (~50 lines) |
| SOUL.md | "Respect the reference repos." — paragraph explaining how to use them |
| DECISIONS.md | Reference Repos table — same 3 repos with descriptions + warning about Pi Web UI |

**Verdict:** 5 restatements. CAPABILITY-MAP.md has the most detailed version. Merge the best of CAPABILITY-MAP.md into CLAUDE.md, remove from others.

### 3. JSONL Parsing Rules

Stated in **4 files**:

| File | Content |
|------|---------|
| CONVENTIONS.md | "JSONL Parsing" section — full code examples, ✅/❌ |
| SOUL.md | "Never use `readline` for JSONL parsing" — hard rule |
| DECISIONS.md | "JSONL Parsing" gotcha — full explanation |
| PI_INTEGRATION.md | "JSONL Framing (Critical)" section — full explanation |

**Verdict:** 4 restatements. Code already uses `JsonlParser` from `@pibun/shared/jsonl`. The convention is enforced by the module. Keep a 1-line mention in CONVENTIONS.md, remove the rest.

### 4. Pi RPC Protocol Details

Stated in **3 files**:

| File | Content |
|------|---------|
| PI_INTEGRATION.md | Full protocol reference (~120 lines) — commands, events, lifecycle |
| DECISIONS.md | "Pi RPC Protocol" table — command/response format, lifecycle events |
| WS_PROTOCOL.md | Partial overlap — methods map to Pi commands |

**Verdict:** PI_INTEGRATION.md is the most complete but duplicates what's in the code (piProcess.ts, contracts types). Per plan, this content becomes TSDoc in source files.

### 5. tool_execution_update Is Accumulated (Not Delta)

Stated in **4 files**:

| File | Content |
|------|---------|
| CONVENTIONS.md | "Tool Execution Updates" section — full code example |
| PI_INTEGRATION.md | "tool_execution_update.partialResult contains the accumulated output" |
| DECISIONS.md | "Tool execution updates — ACCUMULATED, not delta" |
| WEB_UI.md | Event→State mapping table: "Replace tool output (accumulated)" |

**Verdict:** 4 restatements. This is important but one place is enough.

### 6. WebSocket Message Format

Stated in **3 files**:

| File | Content |
|------|---------|
| WS_PROTOCOL.md | Full protocol spec — message types, methods, channels |
| CONVENTIONS.md | "WebSocket Protocol" section — format examples, channel table |
| DECISIONS.md | Decision #9: multi-session via sessionId on WsRequest |

**Verdict:** WS_PROTOCOL.md most complete, but CONVENTIONS.md duplicates the format examples. Per plan, this becomes TSDoc in wsProtocol.ts.

### 7. "Don't Use Effect/Schema"

Stated in **4 files**:

| File | Content |
|------|---------|
| ARCHITECTURE.md | "Why not Effect/Schema?" section |
| DECISIONS.md | Decision #2: "Plain TypeScript + Zustand, no Effect/Schema" |
| CONVENTIONS.md | "No Effect Schema" under TypeScript section |
| HUMAN.md | "Zustand over Redux/Effect" preference |

**Verdict:** 4 restatements. One line in CLAUDE.md is enough.

### 8. "Why Electrobun, Not Electron"

Stated in **2 files**:

| File | Content |
|------|---------|
| ARCHITECTURE.md | "Why Electrobun, not Electron?" section |
| DESKTOP.md | Comparison table |

**Verdict:** Minor — DESKTOP.md is the authoritative doc for this. ARCHITECTURE.md can just reference it.

### 9. Monorepo Structure

Stated in **2 files**:

| File | Content |
|------|---------|
| CLAUDE.md | Full directory tree |
| ARCHITECTURE.md | Same directory tree (slightly different format) |

**Verdict:** Keep in CLAUDE.md only. ARCHITECTURE.md should describe roles, not duplicate the tree.

### 10. Build/Dev Commands

Stated in **1 file** (CLAUDE.md). No redundancy. ✅

### 11. Agent Identity / Personality

Stated in **3 files**:

| File | Content |
|------|---------|
| AGENTS.md | "You are a multi-role cognitive agent" — identity, 5 operational roles |
| SOUL.md | "Be direct. Have opinions. Be resourceful." — personality |
| AGENTS.md | "Session Continuity" — says this file is loaded automatically |

**Verdict:** AGENTS.md (roles) and SOUL.md (personality) overlap in framing but have distinct content. Merge into one section in consolidated CLAUDE.md.

### 12. Gap Detection Protocol

Stated in **2 files**:

| File | Content |
|------|---------|
| AGENTS.md | Full decision tree for gap detection (~30 lines) |
| CAPABILITY-MAP.md | Known gaps table + dynamic rule |

**Verdict:** These are complementary but the gap detection protocol is rarely used in practice. The agent knows its tools. Trim to a short section.

### 13. Playbooks (Adding WS Method, Handling Pi Event, etc.)

Stated in **1 file** (AGENTS.md). These are unique and useful. ✅
But some are partially restated:
- "Adding a Zustand Store Slice" playbook overlaps with CONVENTIONS.md "State Management" section
- "Adding a UI Component" playbook overlaps with CONVENTIONS.md "React Components" section

### 14. Session Protocol ("Read X at start, update Y at end")

Stated in **3 files**:

| File | Content |
|------|---------|
| PLAN.md | "Session Protocol" section — what to read/update each session |
| CONVENTIONS.md | "Quick Checklist (every session)" — same content as checklist |
| SOUL.md | "Follow the plan" — references reading PLAN.md |

**Verdict:** The plan and skills handle this. CONVENTIONS.md checklist duplicates the plan's session protocol.

### 15. Human Context

Stated in **1 file** (HUMAN.md). Unique content. ✅
But some preferences duplicate CONVENTIONS.md:
- "Biome over ESLint" — already in build tooling
- "Tailwind v4" — already implied by project setup
- "Subpath exports over barrel files" — already in CONVENTIONS.md imports section

### 16. Extension/Skill Placement Rules

Stated in **2 files**:

| File | Content |
|------|---------|
| AGENTS.md | "Extension & Skill Placement — Project-First, Always" section |
| CAPABILITY-MAP.md | "How to Extend — Project-First" section |

**Verdict:** Same content in both. Keep once.

---

## Summary: Redundancy Score

| Concept | Files It Appears In | Worst Case |
|---------|---------------------|-----------|
| Thin bridge principle | 7 | Same paragraph restated 7 ways |
| Reference repo guidance | 5 | Same tables with different detail levels |
| JSONL parsing rules | 4 | Same rule + same code example |
| tool_execution_update semantics | 4 | Same sentence 4 times |
| No Effect/Schema | 4 | Same decision 4 times |
| Pi RPC protocol | 3 | Same tables/lists |
| WebSocket format | 3 | Same examples |
| Agent identity + personality | 3 | Overlapping framing |
| Session protocol | 3 | Same checklist |
| Monorepo structure | 2 | Same tree |
| Extension placement | 2 | Same rules |

**Total unique concepts: ~25. Total restatements: ~50+.**
**An agent reading all 12 files encounters the same concept 2-7 times on average.**

---

## Consolidation Plan (for item 1.2)

### New CLAUDE.md (~300 lines) will absorb:

1. **Project identity** — from current CLAUDE.md (keep as-is, it's good)
2. **Architecture** — from CLAUDE.md + ARCHITECTURE.md (merge, dedupe)
3. **Agent personality** — from SOUL.md (trim to essentials)
4. **Human context** — from HUMAN.md (trim to communication style + preferences that affect code decisions)
5. **Reference repos** — from CAPABILITY-MAP.md (the detailed task→file tables)
6. **Playbooks** — from AGENTS.md (keep the 3 main playbooks, trim preamble)
7. **Commands** — from current CLAUDE.md (keep as-is)
8. **Key decisions** — from DECISIONS.md (the table, not the full sections)
9. **Technical context** — from DECISIONS.md (the version/port table)

### CONVENTIONS.md (~150 lines, trimmed from ~200) will keep:

1. JSONL parsing — 1-line reference to `@pibun/shared/jsonl` module
2. Tool execution updates — keep (critical, not in code types)
3. Text streaming — keep (critical, not in code types)
4. React components — keep (patterns not enforced by types)
5. State management — keep (patterns not enforced by types)
6. Imports — keep
7. Naming — keep
8. Error handling — keep
9. Git — keep
10. **Remove:** WebSocket protocol section (duplicates types in wsProtocol.ts)
11. **Remove:** Thin bridge section (now in CLAUDE.md)
12. **Remove:** Quick checklist (plan/skills handle this)
13. **Remove:** File organization section (will be stale after refactoring anyway)

### TENSIONS.md stays as-is (it's a living log, not reference)

### Files to delete:
- `.pi/AGENTS.md` → content merged into CLAUDE.md
- `.pi/CAPABILITY-MAP.md` → content merged into CLAUDE.md
- `.agents/SOUL.md` → content merged into CLAUDE.md
- `.agents/HUMAN.md` → content merged into CLAUDE.md
