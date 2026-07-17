# Core Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every P0–P2 core-implementation gap from `docs/core-implementation-gap-audit.md`, then ship the approved local optional enhancements, ending at a cloud-backend checkpoint without implementing cloud sync.

**Architecture:** Keep domain pure and reusable by TUI + MCP. Replace the contiguous editable guess with five explicit slots; add versioned local active-session persistence beside completed stats; introduce a minute timer for countdown + daily rollover; make MCP submit/language validation atomic; share one tips selector; harden file I/O and terminal capability fallbacks. Optional work stays local-only (hard mode, practice mode, mouse keyboard, animations, themes, history browser, solver explanation, undo latest row).

**Tech Stack:** Bun, TypeScript, `@opentui/core` 0.4.x, Bun test runner, local XDG state files, MCP SDK.

**Source of truth:** `docs/core-implementation-gap-audit.md` plus planning context under `.pi-subagents/artifacts/outputs/e4e423a3-2628-4b54-8541-8d614c6fcbf3/.superpowers/context/`.

## Approved product decisions (locked)

| ID | Decision | Choice |
|----|----------|--------|
| D1 | Midnight during unfinished game | **Persist old session and switch immediately with a visible notice** |
| D2 | Language switch with in-progress work | **Preserve language-scoped sessions automatically** |
| D3 | Restart with unfinished same-language game | **Require confirmation** (finished games restart freely) |
| D4 | Paste | **Exact one normalized 5-letter word fills slots; no auto-submit** |
| D5 | Hard mode | **Official Wordle hard-mode rules** (greens locked, yellows must be reused) |
| D6 | Variable length / unlimited | **Unlimited-attempt five-letter practice mode** (not variable word length) |
| D7 | Animations | **Subtle animation + reduced-motion mode** |
| D8 | Undo | **Undo latest submitted row only** |
| D9 | Cloud | **Out of scope** — plan ends at cloud-backend checkpoint |

## Global constraints

- Use Bun for install, run, typecheck, test, and build (`bun test`, `bun run check`).
- NO HACKS: fix domain models cleanly; no string-with-spaces sparse encoding, no silent MCP truncation, no monkey patches.
- Keep submitted guesses as `string[]` + evaluations; only the **editable** row becomes slots.
- Local XDG state only (`$XDG_STATE_HOME/wordle-tui/` or `~/.local/state/wordle-tui/`). No network, accounts, or remote backends.
- Do not silently reset on daily rollover.
- Do not edit multi-row free-form boards or historical rows except optional latest-row undo.
- Domain remains reusable by OpenTUI app and MCP; MCP sessions stay process-local (no MCP active-board persistence unless a later task explicitly expands scope).
- Prefer injected `effects.now`, temp-dir FS fixtures, and fake timers over wall-clock waits.
- Update README/i18n when restore, paste, delete, hard mode, practice mode, or undo ship; do not pretreat the audit doc as shipped code.
- Stop before cloud sync. Final task is a checkpoint document only.

## Exact files and interfaces

### Domain / storage

| Path | Role after this plan |
|------|----------------------|
| `src/game.ts` | Slot editor, distinct backspace/delete, `setCurrentGuess`, hard-mode checks, practice unlimited attempts, undo latest row |
| `src/session-store.ts` **(new)** | Versioned active sessions + atomic read/write helpers shared with stats |
| `src/stats.ts` | Atomic temp+rename stats I/O, schemaVersion, corruption warning, backup, share ASCII fallback |
| `src/words.ts` | Existing daily helpers; no behavior change beyond test fixtures |
| `src/tips.ts` **(new)** or export from `src/solver.ts` | Pure shared tips selector (candidate-first pool) |
| `src/solver.ts` | Pure rank/filter; optional explanation helpers |
| `src/dictionary.ts` | Unchanged runtime load; integrity checked by new script/test |

### Adapters / UI

| Path | Role after this plan |
|------|----------------------|
| `src/app.ts` | Restore/save active sessions, dual-language preserve, restart confirm, rollover notice, timer hooks, tips cache, practice/hard-mode/undo/history views |
| `src/cli.ts` | Paste listener, minute timer + cleanup, optional capability probe, mouse when enabled |
| `src/input.ts` | Distinct `delete`, `paste`, confirm actions, hard-mode/practice/undo/history shortcuts as needed |
| `src/opentui-view.ts` | Slot rendering, confirm/notice panels, capability modes, subtle animation, themes, mouse keyboard, history/explanation panels |
| `src/mcp.ts` | Atomic `setCurrentGuess` submit, strict language validation, shared tips selector, structured errors |
| `src/i18n.ts` | Autosave, paste, delete, rollover notice, confirm, hard mode, practice, undo, capability strings |
| `README.md` | Board restore, paste, hard mode, practice mode, controls |

### Tests / scripts

| Path | Role |
|------|------|
| `test/game.test.ts` | Slots, delete, setCurrentGuess, hard mode, practice, undo |
| `test/app.test.ts` | Restore, dual sessions, confirm restart, rollover, tips cache |
| `test/stats.test.ts` + new FS tests | Atomic write, corruption, migration, active sessions |
| `test/mcp.test.ts` | Atomic submit, validation, tips parity |
| `test/cli.test.ts` | Timer lifecycle, paste wiring |
| `test/opentui-view.test.ts` | Sparse board, notices, capability modes, animation off |
| `test/index.test.ts` | Input mapping for delete/paste/confirm |
| `test/dictionary-integrity.test.ts` **(new)** or `scripts/validate-dictionaries.ts` | Dict gates |
| `test/*-smoke*.test.ts` **(new, sparse)** | MCP JSON-RPC + optional PTY |

### Core interfaces to introduce

```ts
// src/game.ts
type GuessSlot = string | null;
type EditableGuess = readonly [
  GuessSlot, GuessSlot, GuessSlot, GuessSlot, GuessSlot,
];

type GuessInputError =
  | { code: 'invalid_length' }
  | { code: 'invalid_chars' }
  | { code: 'not_in_dictionary' }
  | { code: 'hard_mode_violation'; message: string }
  | { code: 'game_over' };

// Cursor: 0..WORD_LENGTH inclusive.
// - 0..4 address slots for type/delete/replace
// - WORD_LENGTH means "after last slot" (Backspace clears slot 4; Delete no-op)
// Home → 0; End on empty/partial → first trailing null or WORD_LENGTH when full

setCurrentGuess(word: string): { ok: true } | { ok: false; error: GuessInputError };
// Replaces all five slots atomically after normalize/length/charset checks.
// Does not submit. Dictionary check remains on submitGuess (or optional precheck).

backspace(): void; // clear previous slot, move left, no neighbor shift
deleteSlot(): void; // clear current slot, stay, no neighbor shift
```

```ts
// src/session-store.ts (or versioned fields in stats module)
interface ActivePuzzle {
  dailyId: string;
  language: Language;
  guesses: string[];
  evaluations: LetterEvaluation[][];
  slots: EditableGuess;
  cursorPosition: number;
  status: GameStatus;
  hardMode: boolean;
  mode: 'daily' | 'practice';
  // answer rehydrated from daily id + bank; do not require storing secret if re-derivable
}

interface PersistedState {
  schemaVersion: number;
  introSeen: boolean;
  // existing aggregates + results...
  activeByLanguage: Partial<Record<Language, ActivePuzzle>>;
  settings?: {
    hardModeDefault?: boolean;
    reducedMotion?: boolean;
    theme?: 'default' | 'high-contrast';
  };
}

// Atomic write helper used by stats + active sessions:
// write temp sibling → fsync when practical → rename; keep last-known-good backup
```

```ts
// src/tips.ts
function selectTips(args: {
  language: Language;
  history: Array<{ guess: string; evaluation: LetterEvaluation[] }>;
  answerKeys: string[];
  allWords: Record<string, string> | string[];
  limit?: number;
}): TipsSnapshot;
// Canonical pool: while candidates remain, rank candidate answer keys;
// if empty, fall back to accepted-word keys. Used by app + MCP.
```

```ts
// Actions (src/input.ts) additions
| { type: 'delete' }
| { type: 'paste'; text: string }
| { type: 'confirmRestart' }
| { type: 'cancelRestart' }
| { type: 'undo' }
| { type: 'toggleHardMode' }
| { type: 'startPractice' }
| { type: 'openHistory' }
// existing restart becomes "request restart" when unfinished daily
```

---

### Task 0: Dictionary integrity gate (independent)

**Files:**
- Create: `test/dictionary-integrity.test.ts` (preferred) and/or `scripts/validate-dictionaries.ts`
- Optional modify: `package.json` (wire into `check` only if cheap)

**Interfaces:**
- Produces: automated checks for en/pt banks.

- [ ] **Step 1: Write failing integrity tests**

Assert for both languages:
- normalized keys are exactly five ASCII letters `[a-z]{5}`;
- display forms normalize back to keys;
- every answer key ∈ accepted set;
- no duplicate normalized keys;
- accepted and answer lists non-empty with floors (≥ current sizes with small margin, e.g. en answers ≥ 2000, pt answers ≥ 1500, accepted ≥ 10000).

- [ ] **Step 2: Implement checks against `src/dict/**`**

Pure Bun test reading JSON is enough; no runtime dictionary API change required.

- [ ] **Step 3: Validate**

Run: `bun test ./test/dictionary-integrity.test.ts`  
Expected: PASS on current banks.

---

### Task 1: Sparse slot editor (P0-1)

**Files:**
- Modify: `src/game.ts`
- Modify: `src/opentui-view.ts`
- Modify: `src/app.ts` (`setCursor` end policy)
- Modify: `src/mcp.ts` (`buildGrid` current row)
- Test: `test/game.test.ts`, `test/opentui-view.test.ts`

**Interfaces:**
- Replaces contiguous `currentGuess: string` editor with `EditableGuess` slots.
- May keep a derived display helper for adapters, but sparse holes must be representable.
- Submitted `guesses` remain `string[]`.

- [ ] **Step 1: Write failing slot tests**

Cases:
- empty row → Right×3 → type `a` → slots `[null,null,null,'a',null]`;
- replace first/middle/last without shifting neighbors;
- submit with any hole fails and does not mutate history;
- Home/End on empty and partial rows;
- cursor bounds `0..WORD_LENGTH`; after filling slot 5 cursor may rest at `WORD_LENGTH`;
- typing at full row does not overflow.

- [ ] **Step 2: Implement slot model in `game.ts`**

- Internal `slots: GuessSlot[5]`.
- `addLetter` writes selected slot (or last slot policy when cursor at end) and advances at most to `WORD_LENGTH`.
- `moveCursor` / `setCursorPosition` clamp to `0..WORD_LENGTH`.
- `submitGuess` requires all slots non-null; builds word from slots; clears slots on accept.

- [ ] **Step 3: Update view + MCP grid**

Render each slot independently (`·` for null). Active highlight uses cursor clamped to visible cell `min(cursor, WORD_LENGTH-1)` when drawing.

- [ ] **Step 4: Validate**

Run: `bun test ./test/game.test.ts ./test/opentui-view.test.ts ./test/app.test.ts`  
Expected: new slot tests pass; existing eval/win/lose/share tests still pass.

---

### Task 2: Distinct Backspace vs Delete (P1-5)

**Files:**
- Modify: `src/input.ts`
- Modify: `src/game.ts`
- Modify: `src/app.ts`
- Test: `test/game.test.ts`, `test/index.test.ts`

**Interfaces:**
- New action `{ type: 'delete' }`.
- Backspace: clear previous slot, move left, no shift.
- Delete: clear current slot, stay, no shift.
- At cursor `WORD_LENGTH`: Backspace clears slot 4 and moves to 4; Delete no-op.

- [ ] **Step 1: Write failing tests**

Cover empty, first, middle, last, sparse, and cursor-at-end for both keys. Assert input mapping Backspace ≠ Delete.

- [ ] **Step 2: Implement domain + dispatch**

Split `backspace()` and `deleteSlot()`; map keys in `resolveOpenTuiKey`.

- [ ] **Step 3: Update i18n help if it only mentions Backspace**

- [ ] **Step 4: Validate**

Run: `bun test ./test/game.test.ts ./test/index.test.ts`  
Expected: PASS.

---

### Task 3: Atomic `setCurrentGuess` + MCP submit (P0-4) + MCP language validation (P2-13)

**Files:**
- Modify: `src/game.ts`
- Modify: `src/mcp.ts`
- Test: `test/game.test.ts`, `test/mcp.test.ts`

**Interfaces:**
- `setCurrentGuess(word)` replaces editable row atomically or changes nothing.
- MCP `submit_guess`: validate exact normalized length/charset → `setCurrentGuess` → `submitGuess`.
- MCP `start_game` / `switch_language`: validate language **before** bank/daily lookup; structured errors; no mutation on failure.

- [ ] **Step 1: Write failing tests**

- partial row then MCP submit of full word → exact word, not merge;
- short/long/invalid chars → error, state unchanged;
- accented PT input normalizes like TUI;
- dictionary miss structured error;
- won/lost session rejects cleanly;
- invalid language on switch/start → no bank flip.

- [ ] **Step 2: Implement `setCurrentGuess` and MCP handlers**

Use SDK `isError` / structured content where available. Never loop `addLetter` for tool submit.

- [ ] **Step 3: Validate**

Run: `bun test ./test/game.test.ts ./test/mcp.test.ts`  
Expected: PASS; TUI char path unchanged.

---

### Task 4: Paste policy (P1-6)

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/input.ts` and/or `src/app.ts`
- Modify: `src/i18n.ts` (status messages)
- Test: `test/app.test.ts` and/or `test/cli.test.ts`, `test/index.test.ts`

**Interfaces:**
- CLI listens `keyInput.on('paste', ...)`, decodes UTF-8 via OpenTUI helpers.
- Active **game** view only: one normalized 5-letter word → `setCurrentGuess`; **no auto-submit**.
- Reject multi-line, oversized, mixed, empty atomically with status message.

- [ ] **Step 1: Write failing tests**

Bracketed paste of valid word; accented PT; invalid/too-long; paste in help/progress/tips; paste after completion; assert no submit.

- [ ] **Step 2: Implement paste action path**

Use `createMockKeys(...).pasteBracketedText` where available in OpenTUI testing.

- [ ] **Step 3: Validate**

Run: `bun test ./test/app.test.ts ./test/cli.test.ts ./test/index.test.ts`  
Expected: PASS.

---

### Task 5: Atomic persistence helpers + stats recovery (P1-8 foundation + P0-2 storage)

**Files:**
- Create: `src/session-store.ts` (recommended) **or** extend `src/stats.ts` with shared helpers
- Modify: `src/stats.ts`
- Test: new FS-backed tests under `test/stats.test.ts` or `test/session-store.test.ts`

**Interfaces:**
- `schemaVersion` on persisted document.
- Atomic write: same-dir temp → fsync when practical → rename; last-known-good backup.
- Distinguish missing file (defaults) vs malformed/unreadable (warn, keep backup, do not silent-wipe good history).
- Reject negative counters / wrong types more strictly than silent coerce-only.

- [ ] **Step 1: Write failing FS tests**

Truncated JSON, wrong types, negative counters, missing file, backup recovery, interrupted-write simulation (temp left behind), schema migration from pre-version files.

- [ ] **Step 2: Implement atomic I/O + normalize with warnings**

Return `{ stats, warning?: string }` from load path so app can surface non-fatal UI warning.

- [ ] **Step 3: Validate**

Run: `bun test ./test/stats.test.ts ./test/session-store.test.ts`  
Expected: PASS on temp dirs only.

---

### Task 6: Active-session persistence + dual-language preserve (P0-2, P1-7 preserve half)

**Files:**
- Modify: `src/session-store.ts` / `src/stats.ts`
- Modify: `src/app.ts`
- Modify: `src/i18n.ts`, `README.md`
- Test: `test/app.test.ts`, FS tests

**Interfaces:**
- `activeByLanguage: { en?: ActivePuzzle; pt?: ActivePuzzle }` keyed with `daily.id`.
- Persist after accepted edit/submit/cursor/slot mutations (sync atomic write; debounce only if tests prove chatter is a problem).
- Bootstrap: restore same language+day; completed restore without double `recordDailyResult`; stale daily id archived/discarded.
- Language switch loads the other language’s active session or fresh daily — **never destroys the previous language session**.

- [ ] **Step 1: Write failing restore tests**

Partial/won/lost round-trip; EN/PT isolation; completed idempotency; previous-day discard; corrupt active recovery keeping completed results.

- [ ] **Step 2: Wire app load/save hooks**

Inject store via effects for hermetic tests. On `switchLanguage`, save current active then restore target language.

- [ ] **Step 3: Update help/README autosave copy**

- [ ] **Step 4: Validate**

Run: `bun test ./test/app.test.ts ./test/stats.test.ts`  
Expected: PASS.

---

### Task 7: Restart confirmation (P1-7 confirm half)

**Files:**
- Modify: `src/app.ts`, `src/input.ts`, `src/opentui-view.ts`, `src/i18n.ts`
- Test: `test/app.test.ts`, `test/opentui-view.test.ts`

**Interfaces:**
- Unfinished daily (`status === 'playing'` with progress or non-empty slots/guesses): `restart` action opens confirm; confirm resets and clears that language’s active session; cancel returns to game.
- Finished games: restart immediately (no confirm).
- Practice mode (later task) may restart freely or reuse same confirm — default free restart for practice.

- [ ] **Step 1: Write failing confirmation flow tests**

- [ ] **Step 2: Implement confirm view state + keys (Y/N or Enter/Esc)**

- [ ] **Step 3: Validate**

Run: `bun test ./test/app.test.ts ./test/opentui-view.test.ts`  
Expected: PASS.

---

### Task 8: Daily rollover + countdown timer (P0-3, P1-10)

**Files:**
- Modify: `src/app.ts`
- Modify: `src/cli.ts`
- Test: `test/app.test.ts`, `test/cli.test.ts`

**Interfaces:**
- Approved policy: on `dailyDescriptor(language, now).id` change while process lives:
  1. persist previous active puzzle under its old `daily.id` (archive map or keep until explicitly cleared);
  2. switch controller to the new daily answer/descriptor immediately;
  3. set a visible one-shot notice (i18n) that the day rolled over and previous progress was saved;
  4. never silent-reset without notice;
  5. never double-record stats for the previous daily id.
- Minute timer in CLI (or injectable tick): re-snapshot/render; run rollover detection; clear on shutdown/destroy.
- `restart` always uses **active** daily, not launch-time cache.

- [ ] **Step 1: Write failing rollover tests with mutable injected clock**

- EN UTC midnight cross;
- PT `America/Sao_Paulo` midnight including a DST-sensitive fixture;
- unfinished mid-play → notice + new board + old archived;
- after completion → new daily offered, previous result once;
- countdown text changes on tick without keypress;
- timer cleared on shutdown.

- [ ] **Step 2: Implement `syncDaily(now)` in app + CLI interval**

Prefer app method `onTick(now)` called by CLI every 60s and on snapshot paths. Do not sleep 60s in tests — call `onTick` directly.

- [ ] **Step 3: Validate**

Run: `bun test ./test/app.test.ts ./test/cli.test.ts ./test/stats.test.ts`  
Expected: PASS.

---

### Task 9: Shared tips selector + non-blocking tips (P2-12, P1-9)

**Files:**
- Create: `src/tips.ts` (or export pure helper from solver)
- Modify: `src/app.ts`, `src/mcp.ts`, `src/solver.ts` as needed
- Test: `test/solver.test.ts` or `test/tips.test.ts`, `test/app.test.ts`, `test/mcp.test.ts`

**Interfaces:**
- One pure `selectTips` used by TUI and MCP (candidate-first pool policy).
- App caches by `language + history fingerprint`; invalidate on submit/restart/language/rollover.
- Opening tips shows panel immediately; cache hit avoids recompute; **no Bun worker unless profiling proves need** (document residual risk if sync rank still expensive on cold open).

- [ ] **Step 1: Write parity + cache tests**

Identical history/language → identical candidate count, best guess, ranking for app selector vs MCP path.

- [ ] **Step 2: Extract and wire selector; add memoization**

- [ ] **Step 3: Validate**

Run: `bun test ./test/tips.test.ts ./test/app.test.ts ./test/mcp.test.ts ./test/solver.test.ts`  
Expected: PASS.

---

### Task 10: Terminal capability degradation (P1-11)

**Files:**
- Modify: `src/opentui-view.ts`, `src/cli.ts`, `src/stats.ts` (share symbols)
- Test: `test/opentui-view.test.ts`

**Interfaces:**
- Presentation mode from OpenTUI `TerminalCapabilities` (or injected capability bag in tests):
  - full color RGB when available;
  - ansi256/basic color fallbacks;
  - monochrome: borders/symbols distinguish correct/present/absent without hue alone;
  - weak unicode: ASCII legend/share (`[G]/[Y]/[.]` or similar) instead of emoji.
- Layout remains stable when mode changes.

- [ ] **Step 1: Write view tests for mono + ASCII modes**

- [ ] **Step 2: Implement palette/symbol branching**

Confirm live capability property path on `CliRenderer` when wiring CLI; inject for unit tests.

- [ ] **Step 3: Validate**

Run: `bun test ./test/opentui-view.test.ts`  
Expected: PASS.

---

### Task 11: Bounded E2E smoke (P2-15)

**Files:**
- Create: `test/mcp-protocol.smoke.test.ts` (and optional `test/pty.smoke.test.ts`)
- Modify: existing FS/rollover tests if integration not already covered

**Interfaces:**
- MCP stdio JSON-RPC: initialize → tools/list → tools/call `get_state` / validated `submit_guess` with timeout + process teardown.
- At most one real `createCliRenderer` PTY launch/quit smoke with hard timeout; skip or mark when no TTY in CI.
- Persistence+rollover already covered in controller/FS tests — add one combined integration if gaps remain.
- Document OpenTUI native platform matrix residual in smoke file header or README.

- [ ] **Step 1: Write sparse smokes with explicit timeouts**

- [ ] **Step 2: Ensure clean child-process teardown**

- [ ] **Step 3: Validate**

Run: `bun test ./test`  
Expected: unit suite green; smokes pass or skip with clear reason.

---

### Task 12: Official Wordle hard mode (optional O1)

**Files:**
- Modify: `src/game.ts`, `src/app.ts`, `src/input.ts`, `src/opentui-view.ts`, `src/i18n.ts`
- Persist setting via session/settings
- Test: `test/game.test.ts`, `test/app.test.ts`

**Interfaces:**
- Official rules:
  - any green (correct) letter/position from prior guesses must be reused in that position;
  - any yellow (present) letter must appear somewhere in subsequent guesses;
  - violations reject submit with clear message; board unchanged.
- Toggle before/during game per product UX (default: toggle from help/settings or shortcut); persist `hardMode` on active session + optional default setting.

- [ ] **Step 1: Write hard-mode unit tests (greens locked, yellows required, multi-yellow)**

- [ ] **Step 2: Enforce in `submitGuess` when `hardMode` enabled**

- [ ] **Step 3: Wire toggle + i18n + snapshot indicator**

- [ ] **Step 4: Validate**

Run: `bun test ./test/game.test.ts ./test/app.test.ts`  
Expected: PASS.

---

### Task 13: Unlimited-attempt five-letter practice mode (optional O5 replacement)

**Files:**
- Modify: `src/game.ts`, `src/app.ts`, `src/input.ts`, `src/opentui-view.ts`, `src/i18n.ts`, `README.md`
- Test: `test/game.test.ts`, `test/app.test.ts`

**Interfaces:**
- **Not** variable word length. `WORD_LENGTH` stays 5 everywhere.
- Practice mode: random (or sequential) answer from answer bank; **unlimited attempts** (`maxGuesses = Infinity` or growing board); does not write daily `results`/streaks.
- Entry via shortcut/menu; return to daily preserves dual-language active daily sessions.
- No cloud; local only.

- [ ] **Step 1: Write practice-mode tests**

More than 6 guesses allowed; win still ends; stats aggregates for daily unchanged; leaving practice restores daily active session.

- [ ] **Step 2: Extend game config `maxGuesses` / mode flag without generalizing length**

- [ ] **Step 3: Wire app mode switch + UI label**

- [ ] **Step 4: Validate**

Run: `bun test ./test/game.test.ts ./test/app.test.ts`  
Expected: PASS.

---

### Task 14: Undo latest submitted row only (optional O8)

**Files:**
- Modify: `src/game.ts`, `src/app.ts`, `src/input.ts`, `src/opentui-view.ts`, `src/i18n.ts`
- Test: `test/game.test.ts`, `test/app.test.ts`

**Interfaces:**
- Undo removes only the most recent submitted guess + evaluation; rebuilds keyboard max-rank from remaining history.
- Allowed only while `status === 'playing'` (or carefully define: if undo reopens a just-finished game **before** stats flush, either block undo after `recordDailyResult` or make record lazy until leave — **prefer block undo once daily result recorded**).
- Persist updated active session after undo.
- No multi-step history browser of undos beyond single latest row.

- [ ] **Step 1: Write undo tests (keyboard rank restore, block when empty, block after recorded complete)**

- [ ] **Step 2: Implement `undoLatestGuess()` domain + action**

- [ ] **Step 3: Validate**

Run: `bun test ./test/game.test.ts ./test/app.test.ts`  
Expected: PASS.

---

### Task 15: Subtle animations + reduced motion (optional O3)

**Files:**
- Modify: `src/opentui-view.ts`, `src/cli.ts` / settings, `src/i18n.ts`
- Test: `test/opentui-view.test.ts`

**Interfaces:**
- Subtle reveal or cursor pulse only; must not delay input handling.
- Reduced motion via setting and/or env (`WORDLE_REDUCED_MOTION=1` or `prefers`-style config); when on, animations are instant/no-op.
- No gameplay change.

- [ ] **Step 1: Write tests that reduced-motion path skips animation frames**

- [ ] **Step 2: Implement minimal animation hooks behind flag**

- [ ] **Step 3: Validate**

Run: `bun test ./test/opentui-view.test.ts`  
Expected: PASS.

---

### Task 16: Themes / high-contrast (optional O4) + mouse keyboard (optional O2)

**Files:**
- Modify: `src/opentui-view.ts`, `src/cli.ts`, `src/app.ts`, settings persistence
- Test: `test/opentui-view.test.ts`, `test/cli.test.ts`

**Interfaces:**
- Theme: `default` | `high-contrast` (and reuse mono/ASCII from Task 10).
- High-contrast distinguishable without hue alone (bold/border/symbol).
- Mouse: enable OpenTUI mouse when supported; click on-screen keyboard letters → type; ignore when finished/non-game views.

- [ ] **Step 1: Theme selection tests + mouse click → letter tests with fakes**

- [ ] **Step 2: Implement palettes + optional `useMouse: true` path**

- [ ] **Step 3: Validate**

Run: `bun test ./test/opentui-view.test.ts ./test/cli.test.ts`  
Expected: PASS.

---

### Task 17: Completed-result history browser + solver explanation (optional O6, O7)

**Files:**
- Modify: `src/app.ts`, `src/opentui-view.ts`, `src/input.ts`, `src/i18n.ts`, `src/tips.ts`/`solver.ts`
- Test: `test/app.test.ts`, `test/opentui-view.test.ts`, tips tests

**Interfaces:**
- History: list completed `stats.results` (filter by language); open read-only board from stored evals/guesses/share; no edit.
- Solver explanation: from tips, show top guess entropy/pattern-bucket breakdown using shared selector data.
- Local only.

- [ ] **Step 1: Write history list/detail + explanation panel tests**

- [ ] **Step 2: Implement views and navigation**

- [ ] **Step 3: Validate**

Run: `bun test ./test/app.test.ts ./test/opentui-view.test.ts ./test/tips.test.ts`  
Expected: PASS.

---

### Task 18: Full verification gate

**Files:**
- Modify: `README.md`, `src/i18n.ts` as needed for final copy accuracy
- No new features

- [ ] **Step 1: Run full automated gate**

```bash
bun run typecheck
bun test ./test
bun run build
bun run check
```

Expected: all exit 0.

- [ ] **Step 2: Manual smoke checklist**

- sparse entry `___A_`;
- kill/relaunch mid-daily restores board;
- Ctrl+L preserves other language;
- Ctrl+R unfinished → confirm;
- leave process open and inject/tick past midnight → notice + new daily, old persisted;
- paste five-letter word does not submit;
- MCP `submit_guess` with partial prior row applies exact tool word;
- hard mode rejects illegal guess;
- practice allows >6 guesses without writing daily stats;
- undo latest row once;
- reduced-motion/theme toggles.

- [ ] **Step 3: Diff review**

No cloud clients, no variable word-length generalization, no silent rollover, no contiguous-only editor left for active row.

---

### Task 19: Cloud backend checkpoint (stop — do not implement)

**Files:**
- Create: `docs/superpowers/checkpoints/2026-07-16-cloud-backend-checkpoint.md`

**Interfaces:**
- Documentation only. Records what would be required for cloud sync **later**, without implementing it.

- [ ] **Step 1: Write checkpoint doc covering deferred questions only**

Include:
1. Account model (anonymous device id vs login)
2. Sync transport (HTTP, WebSocket, CRDT, LWW)
3. Conflict policy for EN/PT boards across devices
4. Authoritative daily answer/stats location
5. Privacy/retention of incomplete boards
6. Offline-first merge with local `stats.json` / active sessions
7. Backend stack/hosting/secrets
8. Explicit statement: **local core is complete without cloud; do not start backend work in this track**

- [ ] **Step 2: Stop**

Do not add network clients, auth, or remote APIs. Implementation track ends here.

---

## Implementation sequence (critical path)

```
Task 0  dict integrity
  → Task 1 slots (P0-1)
  → Task 2 Backspace/Delete (P1-5)
  → Task 3 setCurrentGuess + MCP (P0-4, P2-13)
  → Task 4 paste (P1-6)
  → Task 5 atomic I/O (P1-8)
  → Task 6 active sessions + dual-lang preserve (P0-2)
  → Task 7 restart confirm (P1-7)
  → Task 8 rollover + timer (P0-3, P1-10)  [policy locked: persist+switch+notice]
  → Task 9 shared tips + cache (P2-12, P1-9)
  → Task 10 capability fallbacks (P1-11)
  → Task 11 E2E smoke (P2-15)
  → Tasks 12–17 local optionals (hard mode, practice, undo, motion, themes/mouse, history/explain)
  → Task 18 full gate
  → Task 19 cloud checkpoint (docs only)
```

## Validation commands (canonical)

```bash
# focused examples
bun test ./test/game.test.ts
bun test ./test/app.test.ts ./test/stats.test.ts
bun test ./test/mcp.test.ts
bun test ./test/cli.test.ts ./test/opentui-view.test.ts

# full gate
bun run typecheck
bun test ./test
bun run build
bun run check
```

## Self-review

- **Spec coverage:** Every audit P0 (#1–4), P1 (#5–11), P2 (#12–15) has a task with files, interfaces, TDD steps, and Bun commands. Local optionals covered except cloud; variable length replaced by unlimited five-letter practice per approval. Cloud ends at checkpoint only.
- **Locked decisions:** Rollover persist+switch+notice; paste exact no autosubmit; language sessions preserved; restart confirmation; official hard mode; practice unlimited; subtle animation+reduced-motion; undo latest row only.
- **Placeholder scan:** No “TBD implement later” steps inside P0–P2; optional tasks still name concrete files and tests.
- **Type consistency:** `EditableGuess`, `setCurrentGuess`, `ActivePuzzle`, `selectTips`, and new `Action` variants are defined once and reused.
- **Risk residuals called out:** tips cold-rank cost without worker; Windows state path / rename; sparse PTY CI; capability property path confirmation at Task 10; undo vs stats-record timing.

## Out of scope (explicit)

- Cloud synchronization, accounts, remote backends (Task 19 checkpoint only)
- Variable word length
- Multi-row free editing / editing arbitrary historical rows
- Auto-submit on paste
- Silent daily reset
- Replacing OpenTUI or Bun
- Runtime network dictionaries
