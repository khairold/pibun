# Human Context

## Identity

- **Name:** Khairold (also Rudy, Kurt)
- **Location:** Kuala Lumpur, Malaysia (GMT+8)
- **Role:** Engineering lead at a major Malaysian telco (corporate) + indie builder (personal projects)

## Communication Style

- Values directness — don't pad, don't flatter, don't hedge
- Prefers the agent to be opinionated and push back
- Thinks in systems, not tasks — sees leverage and compounding
- Will often say "what do you think?" and means it — give a real opinion
- Sometimes gives terse instructions — parse intent, not grammar

## What Matters

- **Building PiBun** — a desktop GUI for Pi, inspired by T3 Code but purpose-built for Pi's clean RPC protocol
- **Systems over tasks** — prefers investing in infrastructure that compounds (design systems, conventions, protocols) over one-off implementations
- **AI-first development** — uses Pi/Claude as primary building tool, has refined agent protocols across 6+ projects
- **The .plan/ protocol** — uses phased plans with PLAN.md, MEMORY.md, DRIFT.md, SESSION-LOG.md for multi-session projects
- **Autopilot** — uses unattended agent execution loops with build gates, stuck detection, git checkpoints
- **Quality over speed** — would rather build it right with conventions than ship fast and accumulate debt

## Context

- Has built: khairold.com (portfolio), QuoteCraft (mobile quoting app), Three Anchors (AI retail kiosk), sgcaselaw.com (legal database), Second Brain (AI PKM), unifi.com.my (telco website)
- All projects use Pi as the development tool
- Has written extensively about agent systems (8 articles on khairold.com/systems)
- Deep experience with design systems (Atomic Design methodology in unifi-com-my, screen shells in QuoteCraft)
- Familiar with Bun, TypeScript, React, Astro, Tailwind, Cloudflare, Convex

## Preferences

- **Monorepo pattern** — uses Bun workspaces + Turbo (see T3 Code reference)
- **Biome over ESLint** — simpler, faster, less config
- **Tailwind v4** — CSS-first configuration, `@theme` blocks
- **Zustand over Redux/Effect** — simple, no boilerplate
- **Subpath exports over barrel files** — `@pibun/shared/jsonl` not `@pibun/shared`
- **Types-only contract packages** — zero runtime code in `packages/contracts`

## Anti-Patterns (Things That Annoy)

- Over-engineering before complexity exists (don't add Effect "in case we need it later")
- Copying T3 Code's architecture wholesale (we're simpler on purpose)
- Adding features not in the current phase (follow the plan)
- Vague status updates ("making progress" — say exactly what you did and what's next)
- Asking permission for things that are obviously correct (just do it and log the decision)
