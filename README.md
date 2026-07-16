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
- An interactive terminal with color support

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

## Controls

### During play

- Letters: enter or replace letters in the current guess
- `Left` / `Right`: move within the typed portion of the guess
- `Home` / `End`: jump to the start or end
- `Enter`: submit
- `Backspace` / `Delete`: remove the previous letter
- `Tab`: tips
- `Ctrl+H`: help
- `Ctrl+P`: progress
- `Ctrl+L`: switch language and restart the daily puzzle
- `Ctrl+R`: restart
- `Esc`, `Ctrl+C`, `Ctrl+Q`: quit

### After a round

- `S`: copy and reveal the share result
- `R`: restart
- `Q`: quit

In help, progress, and tips, `Esc` returns to the game. The matching shortcut also closes each view.

## Daily game and statistics

Each language has its own daily calendar, answer list, puzzle number, and result history. Completed daily results, streaks, win distribution, and intro state are saved locally:

- `$XDG_STATE_HOME/wordle-tui/stats.json`, when `XDG_STATE_HOME` is set
- otherwise `~/.local/state/wordle-tui/stats.json`

The current in-progress board is not yet restored after restarting the process; see `docs/core-implementation-gap-audit.md` for the documented backlog.

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

## Dictionaries

All dictionaries are bundled locally:

- Portuguese accepted words: `src/dict/pt/all.json`
- Portuguese daily answers: `src/dict/pt/answers.json`
- English accepted words: `src/dict/en/all.json`
- English daily answers: `src/dict/en/answers.json`

See `THIRD_PARTY_NOTICES.md` for source and license attribution.
