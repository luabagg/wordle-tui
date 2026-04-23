#!/usr/bin/env node
import readline, { Key } from 'node:readline';
import { createGame, TILE, WORD_LENGTH, MAX_GUESSES, TileState } from './game';
import { loadWordBank, randomAnswer } from './words';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  fgWhite: '\x1b[97m',
  fgGray: '\x1b[90m',
  bgAbsent: '\x1b[48;5;240m',
  bgPresent: '\x1b[48;5;178m',
  bgCorrect: '\x1b[48;5;34m',
  bgPanel: '\x1b[48;5;236m',
};

const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function bgForTile(tile: TileState): string {
  if (tile === TILE.CORRECT) return colors.bgCorrect;
  if (tile === TILE.PRESENT) return colors.bgPresent;
  if (tile === TILE.ABSENT) return colors.bgAbsent;
  return '';
}

function center(line: string, width: number): string {
  if (line.length >= width) return line;
  const pad = Math.floor((width - line.length) / 2);
  return `${' '.repeat(pad)}${line}`;
}

function tile(letter: string | undefined, state: TileState): string {
  const ch = letter ? letter.toUpperCase() : ' ';
  const bg = bgForTile(state);
  const text = state === TILE.EMPTY ? `${colors.fgGray}${ch}${colors.reset}` : `${colors.fgWhite}${colors.bold}${ch}${colors.reset}`;
  if (state === TILE.EMPTY) return `[${text}]`;
  return `${bg} ${text} ${colors.reset}`;
}

function draw(game: ReturnType<typeof createGame>): void {
  const width = process.stdout.columns || 80;
  const lines: string[] = [];
  lines.push('');
  lines.push(center(`${colors.bold}WORDLE TUI SUPER MODE${colors.reset}`, width));
  lines.push(center(`${colors.fgGray}Local dictionary • Enter submit • Backspace delete • q quit • r restart${colors.reset}`, width));
  lines.push('');

  for (let r = 0; r < MAX_GUESSES; r += 1) {
    let row = '';
    if (r < game.state.guesses.length) {
      const guess = game.state.guesses[r];
      const evals = game.state.evaluations[r];
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile(guess[c], evals[c])} `;
    } else if (r === game.state.guesses.length) {
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile(game.state.currentGuess[c], TILE.EMPTY)} `;
    } else {
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile('', TILE.EMPTY)} `;
    }
    lines.push(center(row.trimEnd(), width));
  }

  lines.push('');
  for (const row of keyRows) {
    const keys = row.split('').map((k) => {
      const state = game.state.keyState.get(k) || TILE.EMPTY;
      const bg = bgForTile(state);
      if (state === TILE.EMPTY) return `${colors.bgPanel} ${k.toUpperCase()} ${colors.reset}`;
      return `${bg}${colors.fgWhite}${colors.bold} ${k.toUpperCase()} ${colors.reset}`;
    }).join(' ');
    lines.push(center(keys, width));
  }

  lines.push('');
  lines.push(center(game.state.message || ' ', width));
  lines.push('');

  process.stdout.write('\x1b[2J\x1b[0f');
  process.stdout.write(lines.join('\n'));
}

export async function run() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('This game requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  const bank = loadWordBank();
  const game = createGame(randomAnswer(bank.answers), bank.validWords);
  game.state.message = 'Using local dictionary.';

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  function exit() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(`\n${colors.reset}`);
  }

  process.stdin.on('keypress', (str: string, key: Key) => {
    if (key.ctrl && key.name === 'c') {
      exit();
      process.exit(0);
    }

    if (key.name === 'q') {
      exit();
      process.exit(0);
    }

    if (key.name === 'r') {
      game.reset(randomAnswer(bank.answers));
      draw(game);
      return;
    }

    if (key.name === 'return') {
      game.submitGuess();
      draw(game);
      return;
    }

    if (key.name === 'backspace') {
      game.backspace();
      draw(game);
      return;
    }

    if (/^[a-z]$/i.test(str || '')) {
      game.addLetter(str.toLowerCase());
      draw(game);
    }
  });

  process.stdout.on('resize', () => draw(game));
  draw(game);
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
}
