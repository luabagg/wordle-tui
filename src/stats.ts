import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameState, MAX_GUESSES, TILE, TileState } from './game';
import { DailyDescriptor } from './words';

export type { DailyDescriptor };

export interface DailyResult {
  puzzle: number;
  won: boolean;
  guesses: number;
  completedAt: string;
  shareText: string;
}

export interface GameStats {
  introSeen: boolean;
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  maxStreak: number;
  distribution: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  results: Record<string, DailyResult>;
}

export function defaultStats(): GameStats {
  return {
    introSeen: false,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    results: {},
  };
}

function normalizeStats(value: unknown): GameStats {
  const fallback = defaultStats();
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<GameStats>;
  const distribution = raw.distribution || fallback.distribution;

  return {
    introSeen: Boolean(raw.introSeen),
    gamesPlayed: Number(raw.gamesPlayed || 0),
    wins: Number(raw.wins || 0),
    losses: Number(raw.losses ?? Math.max(0, Number(raw.gamesPlayed || 0) - Number(raw.wins || 0))),
    currentStreak: Number(raw.currentStreak || 0),
    maxStreak: Number(raw.maxStreak || 0),
    distribution: {
      1: Number(distribution[1] || 0),
      2: Number(distribution[2] || 0),
      3: Number(distribution[3] || 0),
      4: Number(distribution[4] || 0),
      5: Number(distribution[5] || 0),
      6: Number(distribution[6] || 0),
    },
    results: raw.results && typeof raw.results === 'object' ? raw.results : {},
  };
}

export function statsFilePath(env = process.env, home = os.homedir()): string {
  const stateHome = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return path.join(stateHome, 'wordle-tui', 'stats.json');
}

export function loadStats(filePath = statsFilePath()): GameStats {
  try {
    return normalizeStats(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultStats();
    throw error;
  }
}

export function saveStats(stats: GameStats, filePath = statsFilePath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(stats, null, 2)}\n`);
}

function tileEmoji(tile: TileState): string {
  if (tile === TILE.CORRECT) return '🟩';
  if (tile === TILE.PRESENT) return '🟨';
  return '⬛';
}

export function buildShareText(state: GameState, puzzleNumber: number, streak: number): string {
  const result = state.status === 'won' ? state.guesses.length.toString() : 'X';
  const rows = state.evaluations.map((evals) => evals.map(tileEmoji).join(''));
  const headline = state.language === 'en'
    ? `Wordle ${puzzleNumber} ${result}/${MAX_GUESSES}`
    : `joguei term.ooo #${puzzleNumber} *${result}/${MAX_GUESSES} 🔥 ${streak}`;
  return [headline, '', ...rows].join('\n');
}

export function recordDailyResult(
  stats: GameStats,
  state: GameState,
  daily: DailyDescriptor,
  completedAt = new Date()
): { recorded: boolean; result?: DailyResult } {
  if (state.status === 'playing') return { recorded: false };
  if (stats.results[daily.id]) return { recorded: false, result: stats.results[daily.id] };

  const won = state.status === 'won';
  const guesses = state.guesses.length;
  stats.gamesPlayed += 1;

  if (won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    stats.distribution[guesses as 1 | 2 | 3 | 4 | 5 | 6] += 1;
  } else {
    stats.losses += 1;
    stats.currentStreak = 0;
  }

  const result: DailyResult = {
    puzzle: daily.number,
    won,
    guesses,
    completedAt: completedAt.toISOString(),
    shareText: buildShareText(state, daily.number, stats.currentStreak),
  };
  stats.results[daily.id] = result;
  return { recorded: true, result };
}

export function winRate(stats: GameStats): number {
  if (stats.gamesPlayed === 0) return 0;
  return Math.round((stats.wins / stats.gamesPlayed) * 100);
}

export function distributionRows(stats: GameStats): string[] {
  const counts = [1, 2, 3, 4, 5, 6].map((guess) => stats.distribution[guess as 1 | 2 | 3 | 4 | 5 | 6]);
  const losses = stats.losses ?? Math.max(0, stats.gamesPlayed - stats.wins);
  const max = Math.max(1, ...counts);
  const rows = counts.map((count, index) => {
    const bar = count === 0 ? '·' : '█'.repeat(Math.max(1, Math.round((count / max) * 12)));
    return `${index + 1} ${bar} ${count}`;
  });
  const lossBar = losses === 0 ? '·' : '█'.repeat(Math.max(1, Math.round((losses / Math.max(max, losses)) * 12)));
  rows.push(`☠ ${lossBar} ${losses}`);
  return rows;
}

export function osc52CopySequence(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
}
