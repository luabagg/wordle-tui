#!/usr/bin/env node
import readline, { Key } from 'node:readline';
import { createGame, TILE, WORD_LENGTH, MAX_GUESSES, TileState, GameStatus } from './game';
import { messages } from './i18n';
import { dailyAnswer, loadWordBank } from './words';
import { defaultLanguage } from './dictionary';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  fgWhite: '\x1b[97m',
  fgGray: '\x1b[90m',
  fgGreen: '\x1b[38;5;40m',
  fgYellow: '\x1b[38;5;220m',
  fgRed: '\x1b[38;5;203m',
  bgAbsent: '\x1b[48;5;240m',
  bgPresent: '\x1b[48;5;178m',
  bgCorrect: '\x1b[48;5;34m',
  bgPanel: '\x1b[48;5;236m',
};

const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const terminal = {
  enterAltScreen: '\x1b[?1049h',
  leaveAltScreen: '\x1b[?1049l',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearScreen: '\x1b[2J\x1b[H',
};

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

function statusColor(status: string): string {
  if (status === 'won') return colors.fgGreen;
  if (status === 'lost') return colors.fgRed;
  return colors.fgYellow;
}

export function isQuitCommand(key: Pick<Key, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return (key.ctrl && key.name === 'c')
    || (key.ctrl && key.name === 'q')
    || key.name === 'escape'
    || (status !== 'playing' && key.name === 'q');
}

export function isRestartCommand(key: Pick<Key, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return (key.ctrl && key.name === 'r') || (status !== 'playing' && key.name === 'r');
}

export function enterTerminalUi(): string {
  return `${terminal.enterAltScreen}${terminal.hideCursor}${terminal.clearScreen}`;
}

export function leaveTerminalUi(): string {
  return `${terminal.showCursor}${colors.reset}${terminal.leaveAltScreen}`;
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
  const strings = messages[game.state.language];
  const guessesLeft = MAX_GUESSES - game.state.guesses.length;
  const controls = game.state.status === 'playing' ? strings.controlsPlaying : strings.controlsFinished;
  const lines: string[] = [];
  lines.push('');
  lines.push(center(`${colors.bold}${strings.title}${colors.reset}`, width));
  lines.push(center(`${colors.fgGray}${strings.subtitle}${colors.reset}`, width));
  lines.push(center(`${colors.fgGray}${strings.guessesUsed(game.state.guesses.length, guessesLeft)}${colors.reset}`, width));
  lines.push(center(`${colors.fgGray}${controls}${colors.reset}`, width));
  if (strings.accentHint) lines.push(center(`${colors.fgGray}${strings.accentHint}${colors.reset}`, width));
  lines.push('');

  for (let r = 0; r < MAX_GUESSES; r += 1) {
    let row = '';
    if (r < game.state.guesses.length) {
      const guess = Array.from(game.state.guesses[r]);
      const evals = game.state.evaluations[r];
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile(guess[c], evals[c])} `;
    } else if (r === game.state.guesses.length) {
      const currentGuess = Array.from(game.state.currentGuess);
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile(currentGuess[c], TILE.EMPTY)} `;
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
  lines.push(center(`${statusColor(game.state.status)}${game.state.message || ' '}${colors.reset}`, width));
  lines.push('');

  process.stdout.write(terminal.clearScreen);
  process.stdout.write(lines.join('\n'));
}

export async function run() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('This game requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  const initialLanguage = defaultLanguage();
  const bank = loadWordBank();
  const todayAnswer = dailyAnswer(bank.answers);
  const game = createGame({
    answer: todayAnswer,
    dictionary: bank.dictionary,
    language: initialLanguage,
  });

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdout.write(enterTerminalUi());

  function exit() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(leaveTerminalUi());
  }

  function shutdown(exitCode: number) {
    exit();
    process.exit(exitCode);
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('uncaughtException', (err) => {
    process.stderr.write(`${String(err)}\n`);
    shutdown(1);
  });

  process.stdin.on('keypress', (str: string, key: Key) => {
    if (isQuitCommand(key, game.state.status)) {
      shutdown(0);
      return;
    }

    if (isRestartCommand(key, game.state.status)) {
      game.reset(todayAnswer);
      draw(game);
      return;
    }

    if (key.name === 'return') {
      game.submitGuess();
      draw(game);
      return;
    }

    if (key.name === 'backspace' || key.name === 'delete') {
      game.backspace();
      draw(game);
      return;
    }

    if (str && !key.ctrl) {
      game.addLetter(str);
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
