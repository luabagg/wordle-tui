# Core Implementation Gap Audit

**Date:** 2026-07-16  
**Scope:** Post-OpenTUI/Bun port  
**Status:** Documentation only; findings below are not implemented by this audit.

## Executive summary

The game loop, bilingual dictionaries, daily answers, evaluation rules, statistics, sharing, tips, OpenTUI rendering, and MCP mode are implemented. The largest missing core capabilities are:

1. a slot-based editor that supports sparse entry such as `___A_`;
2. persistence and restoration of an in-progress daily board;
3. correct daily rollover while the process stays open;
4. atomic, validated MCP guess submission with behavior parity;
5. explicit paste/delete editing semantics and stronger persistence recovery.

## Priority definitions

- **P0 — core correctness:** behavior can violate the product's fundamental game or daily-session contract.
- **P1 — core UX/reliability:** common user flows are incomplete, destructive, misleading, or fragile.
- **P2 — parity/testability:** implemented surfaces can drift or regress because contracts are duplicated or lightly tested.
- **Optional:** useful enhancements that are not required for a complete Wordle game.

---

## P0 — Core correctness

### 1. Sparse slot editing is not representable

**Current behavior**

`GameState.currentGuess` is a contiguous string. `clampCursor()` limits the cursor to `currentGuess.length`, and `addLetter()` can only replace an existing character or append to the end.

**Evidence**

- `src/game.ts` — `GameState.currentGuess`, `clampCursor`, `addLetter`, `backspace`, `setCursorPosition`
- `src/opentui-view.ts` — active row derives cells from `Array.from(currentGuess)`
- `test/game.test.ts` — cursor test covers replacement inside a filled prefix only

**Missing contract**

Starting from `_____`, moving to position 4 and typing `A` should produce `___A_` without requiring positions 1–3 to be filled.

**Recommended state change**

Replace the editable row's contiguous string representation with five explicit slots:

```ts
type GuessSlot = string | null;

type EditableGuess = readonly [
  GuessSlot,
  GuessSlot,
  GuessSlot,
  GuessSlot,
  GuessSlot,
];
```

Expose a normalized completed word only when all slots are filled. Keep submitted guesses as strings.

**Acceptance criteria**

- Cursor can move across all five slots on an empty row.
- Typing writes to the selected slot and advances at most to slot 5.
- Replacing a filled slot does not shift neighboring slots.
- Submission rejects any row containing a hole.
- Rendering, MCP state, tips history, and sharing remain unchanged for submitted guesses.

**Required tests**

- empty row → move right three times → type `a` → slots equal `[null, null, null, 'a', null]`;
- replace first/middle/last slot;
- submit with holes;
- Home/End on an empty and partial row;
- cursor bounds before and after filling slot 5.

**Non-goal**

Do not add multi-row free editing or editing of already submitted guesses.

### 2. In-progress daily games are not persisted

**Current behavior**

Only intro state and completed daily results/statistics are saved. Current guesses, evaluations, current row, cursor, and language-specific active sessions are lost when the process exits.

**Evidence**

- `src/stats.ts` — `GameStats` stores aggregate statistics and completed `results`
- `src/app.ts` — saves only intro dismissal and newly completed results
- `README.md` — explicitly documents that the current board is not restored

**Impact**

Quitting or terminal failure discards an unfinished daily game. This weakens the expected daily-game contract and makes restart/quit shortcuts destructive.

**Recommended model**

Add versioned, language-scoped active puzzle records keyed by daily ID. Persist after every accepted editing/submission action with a small debounce or atomic synchronous write.

**Acceptance criteria**

- Relaunching the same language/day restores submitted rows, evaluations, editable slots, cursor, and status.
- English and Portuguese progress remain independent.
- A completed result restores as completed without recording statistics twice.
- Stale active puzzles are archived or discarded when their daily ID changes.
- Schema upgrades preserve completed statistics.

**Required tests**

- save/load round trip for partial, won, and lost games;
- language isolation;
- completed-result idempotency;
- previous-day migration;
- corrupted active-state recovery.

**Non-goal**

Cloud sync or cross-device accounts.

### 3. The daily puzzle does not roll over in a long-running process

**Current behavior**

`createWordleApp()` computes `daily` and `todayAnswer` once. `snapshot()` refreshes only the countdown text. Restart after midnight still uses the answer captured at launch.

**Evidence**

- `src/app.ts` — initial daily selection, `snapshot`, and `restart`
- `src/words.ts` — date-aware helpers already exist

**Impact**

A process left open across the daily boundary can display a stale puzzle number/countdown and restart the previous day's answer.

**Product decision required**

Choose one behavior when midnight arrives during an unfinished game:

1. finish the current puzzle and offer the new one afterward; or
2. persist the old game and switch immediately with a visible notice.

Do not reset silently.

**Acceptance criteria**

- App detects a changed `daily.id` without requiring a resize or keypress.
- Countdown refreshes at least once per minute.
- Restart always targets the active daily descriptor.
- Statistics are recorded against the correct daily ID.
- The rollover policy is visible and tested in both time zones.

**Required tests**

- injected clock crossing UTC midnight for English;
- injected clock crossing São Paulo midnight, including DST-sensitive dates;
- rollover while playing and after completion;
- no duplicate result recording.

### 4. MCP guess submission is not atomic or strictly validated

**Current behavior**

The MCP `submit_guess` handler feeds characters through repeated `addLetter()` calls and then submits. Existing partial input can be retained, extra characters can be ignored after five slots, and tool-level validation/errors are weak.

**Evidence**

- `src/mcp.ts` — `submit_guess` handler
- `src/game.ts` — `addLetter` silently ignores invalid/full input

**Impact**

A tool request can submit a value different from its input, particularly when a partial guess already exists or the request exceeds five letters.

**Recommended API**

Add a domain command that replaces the editable row atomically:

```ts
setCurrentGuess(word: string): Result<void, GuessInputError>;
```

The MCP adapter should validate exact normalized length and accepted characters before mutating state.

**Acceptance criteria**

- Each MCP request either applies exactly the supplied guess or changes nothing.
- Invalid length, characters, language, and dictionary misses return structured tool errors.
- Repeated calls do not append to stale partial input.
- MCP and TUI produce the same evaluation and message for the same valid guess.

**Required tests**

- partial state followed by MCP submission;
- overlong/short/invalid input;
- accented Portuguese input;
- dictionary miss;
- won/lost session submission;
- state unchanged after validation failure.

---

## P1 — Core UX and reliability

### 5. Backspace and Delete have identical behavior

**Current behavior**

Both keys map to `{ type: 'backspace' }`, which removes the character before the cursor and shifts the suffix left.

**Evidence**

- `src/input.ts` — Backspace/Delete mapping
- `src/game.ts` — `backspace`

**Desired behavior after slot editing**

- Backspace: clear the previous slot and move left.
- Delete: clear the current slot without moving.
- Neither operation shifts neighboring slots.

**Acceptance criteria/tests**

Cover empty, first, middle, last, and sparse slots. Define behavior at cursor position 5 explicitly.

### 6. Paste input is ignored or undefined

**Current behavior**

The CLI listens only for OpenTUI `keypress`. OpenTUI exposes a separate paste event, but the app has no paste policy.

**Evidence**

- `src/cli.ts` — keypress listener only
- `@opentui/core` — `KeyHandler` supports `paste`

**Recommended policy**

Accept one normalized five-letter word when the active game view is focused. Reject multi-line, oversized, or mixed-content paste atomically. Do not submit automatically unless explicitly chosen as product behavior.

**Required tests**

Bracketed paste, accented Portuguese word, invalid characters, too-long input, paste in help/progress/tips, and paste after completion.

### 7. Restart and language switching discard progress without confirmation

**Current behavior**

`Ctrl+R` and `Ctrl+L` immediately reset the current game. Until in-progress persistence exists, this is irreversible.

**Evidence**

- `src/app.ts` — `restart`, `switchLanguage`
- `src/input.ts` — shortcut mapping

**Acceptance criteria**

After active-state persistence is implemented, either preserve both sessions automatically or ask for confirmation before destructive reset. Finished games can restart without confirmation.

### 8. Stats persistence is non-atomic and corruption recovery is silent

**Current behavior**

Stats are written directly to the final JSON path. Any read/parse error falls back to defaults, which can hide corruption and overwrite history later.

**Evidence**

- `src/stats.ts` — `loadStats`, `saveStats`, `normalizeStats`

**Recommended implementation**

- validate a versioned schema;
- write to a sibling temporary file, fsync when practical, then rename;
- keep a last-known-good backup;
- distinguish missing file from malformed/unreadable file;
- surface a non-fatal warning in the UI.

**Required tests**

Truncated JSON, wrong types, negative counters, permission failure, interrupted write, backup recovery, and schema migration.

### 9. Tips can block the UI

**Current behavior**

Candidate filtering and entropy ranking run synchronously when tips are opened. Large candidate/guess pools can delay the render loop.

**Evidence**

- `src/app.ts` — `getTips`
- `src/solver.ts` — pattern/entropy ranking loops

**Acceptance criteria**

- Opening tips provides immediate feedback.
- Results are cached by guess history.
- Long computation does not block keyboard quit/back handling.
- Language switch/restart invalidates the cache.

**Possible implementations**

Start with memoization and measurement. Use a Bun worker only if profiling shows it is needed.

### 10. Countdown text refreshes only on user-driven renders

**Current behavior**

The countdown is recomputed in `snapshot()`, but snapshots occur on initial render, keypress, and resize only.

**Evidence**

- `src/app.ts` — `snapshot`
- `src/cli.ts` — render triggers

**Acceptance criteria**

Refresh at a low frequency such as once per minute, clean up the timer on shutdown, and integrate with daily rollover detection.

### 11. Terminal capability degradation is incomplete

**Current behavior**

The UI has textual legend symbols and a clipboard fallback, but it assumes color and Unicode rendering.

**Evidence**

- `src/opentui-view.ts` — color palette, tile symbols, share emoji
- `src/cli.ts` — no capability-specific presentation selection

**Acceptance criteria**

- Tiles remain distinguishable without RGB/256-color support.
- A non-color mode uses symbols or borders, not color alone.
- Unicode-width limitations have an ASCII fallback for legend/share display.
- Capability changes do not corrupt layout.

---

## P2 — Parity and testability

### 12. TUI and MCP tips use different guess pools

**Current behavior**

The app controller ranks candidate answers while candidates remain; MCP ranks the full accepted-word dictionary.

**Evidence**

- `src/app.ts` — `getTips`
- `src/mcp.ts` — `get_tips`

**Acceptance criteria**

Extract one pure tips selector used by both adapters. Given identical history/language, candidate count, best candidate, and ranking must match.

### 13. MCP language validation is too permissive at the adapter boundary

**Current behavior**

Tool arguments are cast to `Language` before complete validation. Domain validation eventually catches some cases, but the adapter can choose the wrong bank first and returns generic failures.

**Evidence**

- `src/mcp.ts` — `switch_language`

**Acceptance criteria**

Validate tool inputs before bank/daily lookup and return structured MCP errors with no state mutation.

### 14. Dictionary integrity has no dedicated build check

**Current behavior**

Runtime loading assumes valid five-letter normalized keys, display forms, answer subsets, and non-empty lists.

**Evidence**

- `src/dictionary.ts`
- `src/dict/{en,pt}/*.json`

**Acceptance criteria**

Add a validation script/test that checks:

- normalized keys are exactly five ASCII letters;
- display words normalize back to their keys;
- answers are present in accepted words;
- no duplicate normalized keys;
- lists are non-empty and meet documented size floors.

### 15. End-to-end tests stop short of real protocol interaction

**Current coverage**

OpenTUI frames, mock keys, lifecycle injection, controller behavior, MCP session creation, typecheck, build, and basic process smoke checks are covered.

**Missing coverage**

- real `createCliRenderer` launch/quit in automated CI with a pseudo-TTY;
- a complete MCP JSON-RPC initialize/list/call flow;
- persistence file I/O and corruption scenarios;
- daily rollover/time-zone boundary integration;
- package execution on each supported OpenTUI native platform.

**Acceptance criteria**

Add bounded smoke tests with explicit timeouts and clean process teardown. Keep native/PTY tests few and keep most behavior in fast controller/test-renderer tests.

---

## Optional enhancements

These are useful but are not required to call the current game core-complete:

- hard mode;
- mouse-clickable on-screen keyboard;
- animations and reduced-motion mode;
- custom themes/high-contrast theme selection;
- configurable word length or unlimited mode;
- replay/history browser for completed daily results;
- solver explanation view;
- cloud synchronization;
- undo of a submitted row.

---

## Recommended implementation sequence

1. **Slot editor model:** sparse slots, cursor semantics, Backspace/Delete, submission validation.
2. **Versioned active-session persistence:** atomic storage and same-day restoration.
3. **Daily rollover/timer:** explicit policy, countdown refresh, language-scoped sessions.
4. **Atomic MCP commands and shared selectors:** exact submission, input errors, tips parity.
5. **Paste and destructive-action UX:** paste policy, restart/language confirmation or preserved sessions.
6. **Reliability hardening:** stats recovery, dictionary validation, capability fallbacks.
7. **End-to-end coverage:** PTY, MCP JSON-RPC, persistence, rollover, platform matrix.

## Explicit non-implementation statement

This audit changes no game/editor/MCP behavior. It records evidence, contracts, acceptance criteria, tests, dependencies, and sequencing for future implementation.
