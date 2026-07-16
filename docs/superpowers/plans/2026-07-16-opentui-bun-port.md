# OpenTUI Bun Port Implementation Plan

**Execution status:** Completed on 2026-07-16. The migration was delivered in focused commits from `a8ec956` through `f8a3e28`; final documentation and the gap audit followed afterward.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the handwritten Node/readline/ANSI terminal shell with an OpenTUI application running natively on Bun while preserving the bilingual daily game, stats, tips, sharing, and MCP behavior.

**Architecture:** Keep the existing domain modules (`game`, `dictionary`, `words`, `stats`, `solver`, `mcp`) independent of the UI. Introduce a small OpenTUI application controller that owns view state and actions, and a renderable view layer that updates a stable OpenTUI tree. Retain pure presentation helpers where they improve testability, but remove direct alternate-screen, raw-mode, resize, and ANSI lifecycle management from project code because OpenTUI owns those concerns.

**Tech Stack:** Bun, TypeScript, `@opentui/core` 0.4.x, Bun test runner.

## Global Constraints

- Use Bun for dependency management, scripts, runtime, build, and tests.
- Use `@opentui/core` for terminal rendering, keyboard input, resize behavior, clipboard integration, and terminal lifecycle.
- Preserve `--mcp`, `--lang`, bilingual dictionaries, daily puzzle selection, tips, stats, progress, share output, restart, and language switching.
- Do not implement the later core-feature gap inventory; document it after the port.
- Keep the game domain reusable by both the OpenTUI app and MCP server.
- Avoid compatibility shims, duplicated state machines, direct ANSI screen management, and fragile monkey patches.

---

### Task 1: Convert package and TypeScript configuration to Bun

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Delete: `package-lock.json`
- Modify: `.gitignore`
- Test: `package.json` scripts

**Interfaces:**
- Produces: `bun run start`, `bun run mcp`, `bun run typecheck`, `bun run build`, and `bun test` as the canonical commands.
- Produces: a Bun-compatible ES module TypeScript configuration with no TypeScript emit.

- [ ] **Step 1: Update package scripts and metadata**

Set the CLI runtime to Bun, keep `@opentui/core` and MCP as runtime dependencies, remove npm-specific scripts, add `typecheck`, and build with packages external so OpenTUI native packages remain resolvable.

- [ ] **Step 2: Adopt Bun's recommended TypeScript compiler mode**

Use `target: ESNext`, `module: Preserve`, `moduleResolution: bundler`, `types: ["bun"]`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`, and strict checks.

- [ ] **Step 3: Remove npm lock state and ignore generated/local artifacts**

Delete `package-lock.json`; keep `bun.lock`; ignore `dist/`, `.serena/`, `.pi-subagents/`, and `.superpowers/`.

- [ ] **Step 4: Validate configuration**

Run: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run build`.
Expected: all commands exit 0 and `dist/wordle-tui.js` is produced without bundling package dependencies.

### Task 2: Add an OpenTUI application controller and input adapter

**Files:**
- Create: `src/app.ts`
- Modify: `src/input.ts`
- Test: `test/app.test.ts`
- Modify: `test/index.test.ts`

**Interfaces:**
- Consumes: existing `Game`, dictionaries, daily helpers, stats, solver, and localized strings.
- Produces: `WordleApp` with state/view transitions and `dispatch(action)` independent of terminal streams.
- Produces: `resolveOpenTuiKey(context, key)` mapping OpenTUI `KeyEvent` fields to the existing `Action` union.

- [ ] **Step 1: Write controller tests for preserved flows**

Cover intro dismissal, view switching, restart, language switching, submit/record, share state, tips generation, and finished-game shortcuts without creating a renderer.

- [ ] **Step 2: Implement the controller**

Move composition and action logic out of `src/index.ts`; inject persistence and clipboard callbacks so tests avoid disk and terminal effects.

- [ ] **Step 3: Adapt OpenTUI key events**

Replace the `node:readline` `Key` dependency with a minimal structural key type compatible with OpenTUI and add tests for letters, arrows, Home/End, Enter, Backspace/Delete, Escape, Ctrl shortcuts, Tab, restart, share, and quit.

- [ ] **Step 4: Validate controller tests**

Run: `bun test test/app.test.ts test/index.test.ts test/game.test.ts`.
Expected: all tests pass.

### Task 3: Build the OpenTUI renderable view

**Files:**
- Create: `src/opentui-view.ts`
- Replace: `src/render.ts`
- Modify: `src/tips.ts`
- Test: `test/opentui-view.test.ts`
- Modify: `test/index.test.ts`
- Modify: `test/tips.test.ts`

**Interfaces:**
- Consumes: `WordleApp` snapshots and localized strings.
- Produces: `OpenTuiView` with a stable root renderable and `render(snapshot)` update method.
- Produces: a responsive game/help/progress/tips layout using `BoxRenderable`, `TextRenderable`, and styled text.

- [ ] **Step 1: Write renderer tests with `createTestRenderer`**

Assert the normal-width game frame, narrow terminal layout, help/progress/tips views, localized title, active tile, evaluated tile colors/spans, keyboard state, status message, and finished share prompt.

- [ ] **Step 2: Implement a stable responsive render tree**

Use OpenTUI layout rather than manual centering and clear-screen redraws. Keep tile/keyboard palette semantics, improve narrow-screen readability, and show shortcut hints without overflowing.

- [ ] **Step 3: Update the view incrementally**

Mutate existing renderables or replace only the active content subtree; avoid recreating the renderer or leaking renderables on every keypress.

- [ ] **Step 4: Validate visual behavior**

Run: `bun test test/opentui-view.test.ts test/index.test.ts test/tips.test.ts`.
Expected: all tests pass with captured OpenTUI frames.

### Task 4: Replace the CLI entrypoint with OpenTUI lifecycle

**Files:**
- Replace: `src/index.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `WordleApp`, `OpenTuiView`, `createCliRenderer`, and OpenTUI key events.
- Produces: `run(argv)` that starts OpenTUI in alternate-screen mode and cleanly destroys it on quit/errors/signals.
- Preserves: `--mcp` route without constructing the TUI.

- [ ] **Step 1: Write lifecycle tests around injected renderer/app factories**

Assert non-TTY rejection, MCP bypass, renderer creation, key dispatch/render, resize-owned layout, clipboard use, and one-time destroy behavior.

- [ ] **Step 2: Implement OpenTUI startup and shutdown**

Use `createCliRenderer({ screenMode: "alternate-screen", exitOnCtrlC: false, clearOnShutdown: true })`, `renderer.keyInput.on("keypress", ...)`, `renderer.copyToClipboardOSC52`, and `renderer.destroy()`.

- [ ] **Step 3: Remove handwritten terminal lifecycle code**

Delete readline raw-mode setup, clear-screen output, alternate-screen escape sequences, manual resize drawing, and direct OSC52 emission from the TUI route.

- [ ] **Step 4: Validate CLI tests**

Run: `bun test test/cli.test.ts test/app.test.ts test/opentui-view.test.ts`.
Expected: all tests pass.

### Task 5: Update documentation and run full verification

**Files:**
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md` if dependency attribution changed
- Regenerate: `dist/wordle-tui.js`

**Interfaces:**
- Produces: accurate Bun/OpenTUI install, development, controls, MCP, and build documentation.

- [ ] **Step 1: Update user and contributor commands**

Document Bun installation, `bun install`, `bun run start`, `bun test`, `bun run typecheck`, `bun run build`, language flags, controls, stats, tips, and MCP mode.

- [ ] **Step 2: Run focused validation**

Run: `bun run typecheck` and `bun test`.
Expected: all tests pass once, without duplicate execution of compiled tests.

- [ ] **Step 3: Run production build and smoke tests**

Run: `bun run build`, a pseudo-TTY launch/quit smoke test, and an MCP startup smoke test.
Expected: build exits 0, TUI opens and exits cleanly, MCP starts without initializing a terminal renderer.

- [ ] **Step 4: Review the final diff**

Check for remaining direct ANSI lifecycle code, `node:readline`, npm commands, duplicate generated tests, stale CommonJS assumptions, and committed local-agent artifacts.

### Task 6: Document missing core implementations without implementing them

**Files:**
- Create: `docs/core-implementation-gap-audit.md`

**Interfaces:**
- Produces: prioritized implementation backlog with current behavior, desired behavior, evidence, acceptance criteria, dependencies, and recommended sequencing.

- [ ] **Step 1: Audit game/editor behavior**

Document sparse cursor entry (`_____` → move to position 4 → `___A_`), deletion semantics for holes, cursor movement, submission rules, paste behavior, and slot representation.

- [ ] **Step 2: Audit terminal product behavior**

Document lifecycle, resize/minimum-size handling, focus, keyboard compatibility, clipboard fallback, terminal capability degradation, and accessibility/contrast concerns.

- [ ] **Step 3: Audit game completeness and reliability**

Document hard mode, daily-state restoration, same-day resume, duplicate-result handling, dictionary integrity, persistence corruption recovery, error UX, test gaps, MCP parity, and internationalization edge cases.

- [ ] **Step 4: Prioritize findings**

Separate core correctness, core UX, reliability, and optional enhancements. For each finding include severity, evidence paths, proposed state/API change, acceptance criteria, tests, and non-goals. Do not change source code for these findings.

---

## Self-Review

- Spec coverage: current changes are committed first; Bun migration, OpenTUI port, preserved behavior, improvements, verification, and documentation-only gap investigation are each represented.
- Placeholder scan: no implementation placeholders are used; each task names exact files, commands, interfaces, and expected outcomes.
- Type consistency: `WordleApp`, `resolveOpenTuiKey`, and `OpenTuiView` are introduced once and consumed consistently by later tasks.
