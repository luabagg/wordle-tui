import { createGame, TILE, WORD_LENGTH, MAX_GUESSES, TileState, GameStatus } from './game';
import { messages } from './i18n';
import { GameStats, buildShareText, winRate, distributionRows } from './stats';

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  fgInk: '\x1b[38;5;235m',
  fgWhite: '\x1b[97m',
  fgGray: '\x1b[90m',
  fgMuted: '\x1b[38;5;153m',
  fgCyan: '\x1b[38;5;159m',
  fgGreen: '\x1b[38;5;121m',
  fgYellow: '\x1b[38;5;222m',
  fgRed: '\x1b[38;5;203m',
  bgEmpty: '\x1b[48;5;236m',
  bgAbsent: '\x1b[48;5;250m',
  bgPresent: '\x1b[48;5;222m',
  bgCorrect: '\x1b[48;5;121m',
  bgPanelBright: '\x1b[48;5;237m',
};

export const terminal = {
  enterAltScreen: '\x1b[?1049h',
  leaveAltScreen: '\x1b[?1049l',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearScreen: '\x1b[2J\x1b[H',
};

const ansiPattern = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function enterTerminalUi(): string {
  return `${terminal.enterAltScreen}${terminal.hideCursor}${terminal.clearScreen}`;
}

export function leaveTerminalUi(): string {
  return `${terminal.showCursor}${colors.reset}${terminal.leaveAltScreen}`;
}

export function bgForTile(tile: TileState): string {
  if (tile === TILE.CORRECT) return colors.bgCorrect;
  if (tile === TILE.PRESENT) return colors.bgPresent;
  if (tile === TILE.ABSENT) return colors.bgAbsent;
  return '';
}

export function visibleLength(line: string): number {
  return line.replace(ansiPattern, '').length;
}

export function center(line: string, width: number): string {
  const length = visibleLength(line);
  if (length >= width) return line;
  const pad = Math.floor((width - length) / 2);
  return `${' '.repeat(pad)}${line}`;
}

export function style(text: string, ...codes: string[]): string {
  return `${codes.join('')}${text}${colors.reset}`;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function pushCenteredWrapped(lines: string[], text: string, width: number, ...codes: string[]): void {
  const wrapWidth = Math.max(28, Math.min(width - 4, 72));
  for (const line of wrapText(text, wrapWidth)) {
    lines.push(center(style(line, ...codes), width));
  }
}

function statusColor(status: GameStatus): string {
  if (status === 'won') return colors.fgGreen;
  if (status === 'lost') return colors.fgRed;
  return colors.fgYellow;
}

const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function tile(letter: string | undefined, state: TileState, active = false): string {
  const ch = letter ? letter.toUpperCase() : ' ';
  if (active) {
    const text = ch === ' ' ? '·' : ch;
    return style(`  ${text}  `, colors.bgPanelBright, colors.fgWhite, colors.bold);
  }
  if (state === TILE.EMPTY) {
    const text = ch === ' ' ? '·' : ch;
    return style(`  ${text}  `, colors.bgEmpty, colors.fgMuted, colors.bold);
  }
  if (state === TILE.PRESENT) {
    return style(`  ${ch}  `, colors.bgPresent, colors.fgInk, colors.bold);
  }
  if (state === TILE.ABSENT) {
    return style(`  ${ch}  `, colors.bgAbsent, colors.fgInk, colors.bold);
  }
  return style(`  ${ch}  `, bgForTile(state), colors.fgInk, colors.bold);
}

function keyChip(letter: string, state: TileState): string {
  const ch = letter.toUpperCase();
  if (state === TILE.CORRECT) return style(` ${ch} `, colors.bgCorrect, colors.fgInk, colors.bold);
  if (state === TILE.PRESENT) return style(` ${ch} `, colors.bgPresent, colors.fgInk, colors.bold);
  if (state === TILE.ABSENT) return style(` ${ch} `, colors.bgAbsent, colors.fgInk, colors.bold);
  return style(` ${ch} `, colors.bgPanelBright, colors.fgMuted, colors.bold);
}

function legendChip(text: string, state: TileState, language: 'en' | 'pt'): string {
  const label = state === TILE.CORRECT
    ? messages[language].helpLegendCorrect
    : state === TILE.PRESENT
      ? messages[language].helpLegendPresent
      : messages[language].helpLegendAbsent;
  return `${tile(text, state)} ${label}`;
}

function pushKeyboardLegend(lines: string[], width: number, language: 'en' | 'pt'): void {
  lines.push(center(style(messages[language].helpLegendTitle, colors.fgMuted, colors.bold), width));
  lines.push(center(`${legendChip('C', TILE.CORRECT, language)}  ${legendChip('E', TILE.PRESENT, language)}  ${legendChip('F', TILE.ABSENT, language)}`, width));
}

export function renderHelpLines(width: number, language: 'en' | 'pt' = 'pt'): string[] {
  const safeWidth = Math.max(34, width || 80);
  const strings = messages[language];
  const lines: string[] = [];
  lines.push('');
  lines.push(center(style(strings.helpTitle, colors.bgPanelBright, colors.fgCyan, colors.bold), safeWidth));
  lines.push('');
  pushCenteredWrapped(lines, strings.helpIntro, safeWidth, colors.fgWhite, colors.bold);
  pushCenteredWrapped(lines, strings.helpInstructions, safeWidth, colors.fgMuted);
  lines.push('');
  pushKeyboardLegend(lines, safeWidth, language);
  lines.push('');
  pushCenteredWrapped(lines, strings.helpAutosave, safeWidth, colors.fgGray);
  pushCenteredWrapped(lines, strings.helpShortcuts, safeWidth, colors.fgGray);
  lines.push('');
  lines.push(center(style(strings.helpBack, colors.fgGreen, colors.bold), safeWidth));
  lines.push('');
  return lines;
}

export interface RenderGameOptions {
  stats?: GameStats;
  puzzleNumber?: number;
  nextWordIn?: string;
  showIntro?: boolean;
  shareCopied?: boolean;
}

export function renderProgressLines(stats: GameStats, width: number, nextWordIn: string, language: 'en' | 'pt' = 'pt'): string[] {
  const safeWidth = Math.max(34, width || 80);
  const strings = messages[language];
  const lines: string[] = [];
  lines.push('');
  lines.push(center(style(strings.progressTitle, colors.fgCyan, colors.bold), safeWidth));
  lines.push(center(style(strings.progressStats({
    gamesPlayed: stats.gamesPlayed,
    winRate: winRate(stats),
    currentStreak: stats.currentStreak,
    maxStreak: stats.maxStreak,
  }), colors.fgMuted), safeWidth));
  lines.push('');
  for (const row of distributionRows(stats)) {
    lines.push(center(style(row, colors.fgGray), safeWidth));
  }
  lines.push('');
  lines.push(center(style(strings.progressNextWord(nextWordIn), colors.fgYellow, colors.bold), safeWidth));
  lines.push('');
  lines.push(center(style(strings.progressBack, colors.fgGreen, colors.bold), safeWidth));
  lines.push('');
  return lines;
}

function pushShare(
  lines: string[],
  game: ReturnType<typeof createGame>,
  width: number,
  options: RenderGameOptions,
  language: 'en' | 'pt',
): void {
  if (game.state.status === 'playing' || !options.stats || !options.puzzleNumber) return;

  const strings = messages[language];
  lines.push('');
  if (!options.shareCopied) {
    lines.push(center(style(strings.sharePrompt, colors.fgGreen, colors.bold), width));
    return;
  }

  lines.push(center(style(strings.shareCopied, colors.fgGreen, colors.bold), width));
  for (const line of buildShareText(game.state, options.puzzleNumber, options.stats.currentStreak).split('\n')) {
    lines.push(center(style(line || ' ', colors.fgWhite), width));
  }
}

export function renderGameLines(
  game: ReturnType<typeof createGame>,
  width: number,
  options: RenderGameOptions = {},
): string[] {
  if (options.showIntro) return renderHelpLines(width, game.state.language);

  const strings = messages[game.state.language];
  const guessesLeft = MAX_GUESSES - game.state.guesses.length;
  const controls = game.state.status === 'playing' ? strings.controlsPlaying : strings.controlsFinished;
  const lines: string[] = [];
  const safeWidth = Math.max(34, width || 80);

  lines.push('');
  lines.push(center(style(` ${strings.title} `, colors.bgPanelBright, colors.fgCyan, colors.bold), safeWidth));
  pushCenteredWrapped(lines, strings.subtitle, safeWidth, colors.fgMuted);
  lines.push(center(style(strings.guessesUsed(game.state.guesses.length, guessesLeft), colors.fgGray), safeWidth));
  pushCenteredWrapped(lines, controls, safeWidth, colors.fgGray);
  if (strings.accentHint) pushCenteredWrapped(lines, strings.accentHint, safeWidth, colors.fgMuted);
  lines.push('');

  for (let r = 0; r < MAX_GUESSES; r += 1) {
    let row = '';
    if (r < game.state.guesses.length) {
      const guess = Array.from(game.state.guesses[r]);
      const evals = game.state.evaluations[r];
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile(guess[c], evals[c])} `;
    } else if (r === game.state.guesses.length) {
      const currentGuess = Array.from(game.state.currentGuess);
      const activeIndex = Math.min(game.state.cursorPosition, WORD_LENGTH - 1);
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile(currentGuess[c], TILE.EMPTY, c === activeIndex)} `;
    } else {
      for (let c = 0; c < WORD_LENGTH; c += 1) row += `${tile('', TILE.EMPTY)} `;
    }
    lines.push(center(row.trimEnd(), safeWidth));
  }

  lines.push('');
  for (const row of keyRows) {
    const keys = row.split('').map((k) => {
      const state = game.state.keyState.get(k) || TILE.EMPTY;
      return keyChip(k, state);
    }).join(' ');
    lines.push(center(keys, safeWidth));
  }

  lines.push('');
  pushKeyboardLegend(lines, safeWidth, game.state.language);

  lines.push('');
  pushCenteredWrapped(lines, game.state.message || ' ', safeWidth, statusColor(game.state.status), colors.bold);
  pushShare(lines, game, safeWidth, options, game.state.language);
  lines.push('');

  return lines;
}

