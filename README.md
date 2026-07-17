# Wordle TUI

A bilingual daily word game for the terminal, built with Bun, TypeScript, and [OpenTUI](https://github.com/anomalyco/opentui).

- Portuguese Termo-style mode (`pt`, default)
- English Wordle-style mode (`en`)
- Local dictionaries; no runtime network dependency
- Daily puzzles, statistics, streaks, share output, and solver tips
- Keyboard-first OpenTUI interface
- Optional MCP server using the same game domain

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- An interactive terminal (RGB, ANSI-256/basic, and colorless modes are supported)

## Install

```bash
bun install
```

## Run

Portuguese:

```bash
bun run start
```

English:

```bash
bun run start -- --lang=en
```

The short form is also supported:

```bash
bun run start -- -l en
```

OpenTUI's `unicode` terminal capability selects a width-measurement algorithm; it does not detect glyph support. If a terminal cannot render the default Unicode/emoji symbols reliably, request the explicit ASCII presentation:

```bash
WORDLE_ASCII=1 bun run start
```

## Controls

### During play

- Letters: fill or replace the selected slot
- Paste: fill exactly one normalized five-letter word; never auto-submits
- `Left` / `Right`: move across all five slots
- `Home` / `End`: jump to the start or first trailing empty slot
- `Enter`: submit
- `Backspace`: clear the previous slot and move left
- `Delete`: clear the current slot without moving
- `Tab`: tips
- `Ctrl+H`: help
- `Ctrl+P`: progress
- `Ctrl+L`: switch language (each language keeps its own in-progress board)
- `Ctrl+R`: restart (asks for confirmation when the daily board has progress)
- `Ctrl+D`: toggle hard mode (official green/yellow reuse; preference is saved locally)
- `Ctrl+T`: enter or leave five-letter practice mode (unlimited attempts; no daily stats)
- `Ctrl+Z`: undo the latest submitted row when allowed
- `Esc`, `Ctrl+C`, `Ctrl+Q`: quit

### After a round

- `S`: copy and reveal the share result
- `R`: restart
- `Q`: quit
- `Ctrl+Z`: undo the latest row in practice, or in daily only before the result is recorded
- `Ctrl+T`: return to the preserved daily board from practice

In help, progress, and tips, `Esc` returns to the game. The matching shortcut also closes each view.

## Daily game and statistics

Each language has its own daily calendar, answer list, puzzle number, and result history. In-progress boards, completed daily results, streaks, win distribution, hard-mode preference, and intro state are saved locally:

- `$XDG_STATE_HOME/wordle-tui/stats.json`, when `XDG_STATE_HOME` is set
- otherwise `~/.local/state/wordle-tui/stats.json`

Relaunching restores the active board for the current language and day. Switching language preserves the other language session. If midnight arrives while the process is open, the unfinished board is archived and the new daily puzzle starts with a visible notice.

### Hard mode

Hard mode follows official Wordle constraints:

- every previously correct (green) letter must stay in that position
- every previously present/correct letter must appear at least as many times as revealed

Illegal guesses are rejected without changing the board. The hard-mode preference is stored in local settings and on the active session.

### Practice mode

`Ctrl+T` starts an unlimited-attempt five-letter practice game drawn from the current language answer bank. Practice never records daily results, streaks, or win distribution. Entering practice preserves the active daily board; pressing `Ctrl+T` again restores it.

### Undo

`Ctrl+Z` removes only the latest submitted row and rebuilds keyboard coloring from remaining history. Daily undo is blocked after a completed result has been recorded. Practice may undo its final row because practice has no durable stats.

## Tips

Press `Tab` to see:

- remaining answer candidates
- the best remaining answer candidate
- entropy-ranked guesses

Tips use only bundled local dictionaries.

## MCP mode

Start the stdio MCP server without initializing the terminal UI:

```bash
bun run mcp
```

Available tools:

- `start_game`
- `get_state`
- `submit_guess`
- `switch_language`
- `get_tips`

## Development

```bash
bun run typecheck
bun test ./test
bun run build
```

Run all verification:

```bash
bun run check
```

The production bundle is generated at `dist/wordle-tui.js`. Runtime packages remain external so OpenTUI can resolve the correct native package for the current platform.

CI runs the full check on Linux, macOS, and Windows, matching OpenTUI's supported native OS families. The real PTY launch/quit smoke is guarded to Linux runners with util-linux `script`; other runners execute the capability-mocked OpenTUI suite. OpenTUI also publishes ARM64 native packages, but Linux/Windows ARM64 remain guarded until standard hosted runners are available.

## Dictionaries

All dictionaries are bundled locally:

- Portuguese accepted words: `src/dict/pt/all.json`
- Portuguese daily answers: `src/dict/pt/answers.json`
- English accepted words: `src/dict/en/all.json`
- English daily answers: `src/dict/en/answers.json`

See `THIRD_PARTY_NOTICES.md` for source and license attribution.
