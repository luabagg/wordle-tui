# Termo TUI (TypeScript)

A keyboard-driven Portuguese word game for the terminal, authored in TypeScript
and shaped after the core term.ooo experience.

## How To Play

Discover the correct five-letter Portuguese word in 6 tries.

Each guess must be a valid 5-letter Portuguese word. Hit `Enter` to submit.

After each guess, the color of the tiles will change to show how close your
guess was to the word.

Accents are filled automatically, and accents/diacritics are ignored for hints.
Words may contain repeated letters.

### Examples

Green tile: The letter T is in the word and in the correct spot.

Yellow tile: The letter O is in the word but in the wrong spot.

Gray tile: The letter G is not in the word in any spot.

A deterministic daily answer is selected from the bundled answer list. Restarting
the same session restarts the current daily word.

The first run shows a short introduction screen. Daily progress, streaks, and
guess distribution are saved locally under the user's state directory.

## Install / run with npx

After publishing this package, users can run it directly with:

```bash
npx wordle-tui
```

For local development in this repo:

```bash
npm run build
npx --yes .
```

## Dictionary source

The game uses a **local bundled dictionary only** (no network dependency at runtime):

- 11,000+ accepted five-letter Brazilian Portuguese words from
  `src/dict/pt/all.json`.
- A 2,000-word common subset from `src/dict/pt/answers.json` is used for daily answers.

See `THIRD_PARTY_NOTICES.md` for word-list attribution.

## Why there is no `node-shim` now

A `node-shim` file was previously used to fake Node typings in restricted environments. It has been removed to keep the project cleaner and simpler.

## Controls

- Type letters to build a guess.
- `Left` / `Right`, `Home`, and `End` move inside the current guess.
- `Enter` submits a guess.
- `Backspace` removes a letter.
- `Ctrl+H` opens help.
- `Ctrl+P` opens progress. `Esc` or `Ctrl+P` returns from progress.
- `Esc`, `Ctrl+C`, or `Ctrl+Q` quits during play.
- `Ctrl+R` starts a new game during play.
- After a round ends, `r` starts a new game and `q` quits.
- After a round ends, `s` copies the Termo-style share result when the terminal
  supports clipboard escape sequences. The share block is also shown on screen.

## Test

```bash
npm test
```
