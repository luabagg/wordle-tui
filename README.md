# Wordle TUI (TypeScript)

A keyboard-driven Wordle clone for the terminal, authored in TypeScript.

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

The game now uses a **local bundled dictionary only** (no network dependency at runtime).

## Why there is no `node-shim` now

A `node-shim` file was previously used to fake Node typings in restricted environments. It has been removed to keep the project cleaner and simpler.

## Controls

- Type letters to build a guess.
- `Enter` submits a guess.
- `Backspace` removes a letter.
- `r` starts a new game.
- `q` quits.

## Test

```bash
npm test
```
