import os from 'node:os';
import path from 'node:path';
import { MAX_GUESSES, TILE } from './game';
import type { GameState, TileState } from './game';
import type { Language } from './i18n';
import {
  STATS_SCHEMA_VERSION,
  activePuzzleFromGame,
  atomicWriteJson,
  defaultSettings,
  hasActiveProgress,
  normalizeActiveByLanguage,
  normalizeArchivedActive,
  normalizeActivePuzzle,
  normalizeSettings,
  readJsonDocument,
  type ActivePuzzle,
  type AppSettings,
} from './session-store';
import type { DailyDescriptor } from './words';

export type { DailyDescriptor, ActivePuzzle, AppSettings };
export {
  STATS_SCHEMA_VERSION,
  defaultSettings,
  hasActiveProgress,
  activePuzzleFromGame,
};

export interface DailyResult {
  puzzle: number;
  won: boolean;
  guesses: number;
  completedAt: string;
  shareText: string;
}

export interface GameStats {
  schemaVersion: number;
  introSeen: boolean;
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  maxStreak: number;
  distribution: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  results: Record<string, DailyResult>;
  activeByLanguage: Partial<Record<Language, ActivePuzzle>>;
  /** Previous-day (or otherwise superseded) unfinished sessions, keyed by dailyId. */
  archivedActive: Record<string, ActivePuzzle>;
  settings: AppSettings;
}

export interface LoadStatsResult {
  stats: GameStats;
  warning?: string;
}

export function defaultStats(): GameStats {
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    introSeen: false,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    results: {},
    activeByLanguage: {},
    archivedActive: {},
    settings: defaultSettings(),
  };
}

function nonNegativeInt(value: unknown, fallback = 0): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function normalizeDailyResult(value: unknown): DailyResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DailyResult>;
  const puzzle = nonNegativeInt(raw.puzzle, 0);
  const guesses = nonNegativeInt(raw.guesses, 0);
  if (puzzle === null || guesses === null) return null;
  if (typeof raw.won !== 'boolean') return null;
  if (typeof raw.completedAt !== 'string') return null;
  if (typeof raw.shareText !== 'string') return null;
  return {
    puzzle,
    won: raw.won,
    guesses,
    completedAt: raw.completedAt,
    shareText: raw.shareText,
  };
}

function normalizeResults(value: unknown): { results: Record<string, DailyResult>; warning?: string } {
  if (value == null) return { results: {} };
  if (!value || typeof value !== 'object') {
    return { results: {}, warning: 'Completed results were invalid and were discarded.' };
  }
  const results: Record<string, DailyResult> = {};
  let warning: string | undefined;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const result = normalizeDailyResult(raw);
    if (result) results[id] = result;
    else warning = 'Some completed results could not be restored.';
  }
  return { results, warning };
}

export function normalizeStats(value: unknown): LoadStatsResult {
  const fallback = defaultStats();
  if (value == null) return { stats: fallback };
  if (typeof value !== 'object') {
    return {
      stats: fallback,
      warning: 'Saved statistics were unreadable and were reset to defaults.',
    };
  }

  const raw = value as Record<string, unknown>;
  const warnings: string[] = [];

  const gamesPlayed = nonNegativeInt(raw.gamesPlayed, 0);
  const wins = nonNegativeInt(raw.wins, 0);
  const currentStreak = nonNegativeInt(raw.currentStreak, 0);
  const maxStreak = nonNegativeInt(raw.maxStreak, 0);

  if (gamesPlayed === null || wins === null || currentStreak === null || maxStreak === null) {
    warnings.push('Some statistic counters were invalid and were reset.');
  }

  let losses = nonNegativeInt(raw.losses, undefined as unknown as number);
  if (losses === null) {
    warnings.push('Some statistic counters were invalid and were reset.');
    losses = null;
  }

  const safeGames = gamesPlayed ?? 0;
  const safeWins = wins ?? 0;
  const safeLosses = losses ?? Math.max(0, safeGames - safeWins);
  const safeCurrent = currentStreak ?? 0;
  const safeMax = maxStreak ?? 0;

  const distributionSource =
    raw.distribution && typeof raw.distribution === 'object'
      ? (raw.distribution as Record<string, unknown>)
      : {};

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  for (const key of [1, 2, 3, 4, 5, 6] as const) {
    const count = nonNegativeInt(distributionSource[String(key)], 0);
    if (count === null) {
      warnings.push('Guess distribution values were invalid and were reset.');
      distribution[key] = 0;
    } else {
      distribution[key] = count;
    }
  }

  const { results, warning: resultsWarning } = normalizeResults(raw.results);
  if (resultsWarning) warnings.push(resultsWarning);

  const { active, warning: activeWarning } = normalizeActiveByLanguage(raw.activeByLanguage);
  if (activeWarning) warnings.push(activeWarning);

  const archivedActive = normalizeArchivedActive(raw.archivedActive);
  const settings = normalizeSettings(raw.settings);

  // Migrate pre-version documents (no schemaVersion) without dropping completed stats.
  const schemaVersionRaw = nonNegativeInt(raw.schemaVersion, 0);
  const schemaVersion = schemaVersionRaw === null ? STATS_SCHEMA_VERSION : Math.max(schemaVersionRaw, 1);
  if (schemaVersion < STATS_SCHEMA_VERSION) {
    // Migration is structural only; values already normalized above.
  }

  // Legacy single-session shape (if any future/local experiments used top-level active)
  if (!raw.activeByLanguage && raw.active && typeof raw.active === 'object') {
    const legacy = normalizeActivePuzzle(raw.active);
    if (legacy) active[legacy.language] = legacy;
  }

  return {
    stats: {
      schemaVersion: STATS_SCHEMA_VERSION,
      introSeen: Boolean(raw.introSeen),
      gamesPlayed: safeGames,
      wins: safeWins,
      losses: safeLosses,
      currentStreak: safeCurrent,
      maxStreak: safeMax,
      distribution,
      results,
      activeByLanguage: active,
      archivedActive,
      settings,
    },
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
}

export function statsFilePath(env = process.env, home = os.homedir()): string {
  const stateHome = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return path.join(stateHome, 'wordle-tui', 'stats.json');
}

export function loadStatsResult(filePath = statsFilePath()): LoadStatsResult {
  const document = readJsonDocument(filePath);
  if (document.status === 'missing') {
    return { stats: defaultStats() };
  }

  if (document.value == null) {
    return {
      stats: defaultStats(),
      warning: document.warning ?? 'Saved statistics were unreadable and were reset to defaults.',
    };
  }

  const normalized = normalizeStats(document.value);
  const warning = [document.warning, normalized.warning].filter(Boolean).join(' ') || undefined;
  return { stats: normalized.stats, warning };
}

/** Backward-compatible loader that returns only stats. Prefer `loadStatsResult`. */
export function loadStats(filePath = statsFilePath()): GameStats {
  return loadStatsResult(filePath).stats;
}

export function saveStats(stats: GameStats, filePath = statsFilePath()): void {
  const payload: GameStats = {
    ...stats,
    schemaVersion: STATS_SCHEMA_VERSION,
  };
  atomicWriteJson(filePath, payload, { backup: true });
}

export function setActivePuzzle(stats: GameStats, puzzle: ActivePuzzle | null, language: Language): void {
  if (!puzzle) {
    delete stats.activeByLanguage[language];
    return;
  }
  stats.activeByLanguage[language] = { ...puzzle, language };
}

export function archiveActivePuzzle(stats: GameStats, puzzle: ActivePuzzle): void {
  if (!hasActiveProgress(puzzle)) return;
  stats.archivedActive[puzzle.dailyId] = { ...puzzle };
}

export function clearActivePuzzle(stats: GameStats, language: Language): void {
  delete stats.activeByLanguage[language];
}

export type ShareGlyphMode = 'emoji' | 'ascii';

function tileGlyph(tile: TileState, mode: ShareGlyphMode): string {
  if (mode === 'ascii') {
    if (tile === TILE.CORRECT) return 'G';
    if (tile === TILE.PRESENT) return 'Y';
    return 'B';
  }
  if (tile === TILE.CORRECT) return '🟩';
  if (tile === TILE.PRESENT) return '🟨';
  return '⬛';
}

export function buildShareText(
  state: GameState,
  puzzleNumber: number,
  streak: number,
  options: { glyphs?: ShareGlyphMode } = {},
): string {
  const glyphs = options.glyphs ?? 'emoji';
  const result = state.status === 'won' ? state.guesses.length.toString() : 'X';
  const rows = state.evaluations.map((evals) => evals.map((tile) => tileGlyph(tile, glyphs)).join(''));
  const fire = glyphs === 'ascii' ? '*' : '🔥';
  const headline = state.language === 'en'
    ? `Wordle ${puzzleNumber} ${result}/${MAX_GUESSES}`
    : `joguei term.ooo #${puzzleNumber} *${result}/${MAX_GUESSES} ${fire} ${streak}`;
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

export function distributionRows(
  stats: GameStats,
  options: { glyphs?: 'unicode' | 'ascii' } = {},
): string[] {
  const glyphs = options.glyphs ?? 'unicode';
  const emptyMark = glyphs === 'ascii' ? '.' : '·';
  const fullMark = glyphs === 'ascii' ? '#' : '█';
  const lossMark = glyphs === 'ascii' ? 'X' : '☠';
  const counts = [1, 2, 3, 4, 5, 6].map((guess) => stats.distribution[guess as 1 | 2 | 3 | 4 | 5 | 6]);
  const losses = stats.losses ?? Math.max(0, stats.gamesPlayed - stats.wins);
  const max = Math.max(1, ...counts);
  const rows = counts.map((count, index) => {
    const bar = count === 0 ? emptyMark : fullMark.repeat(Math.max(1, Math.round((count / max) * 12)));
    return `${index + 1} ${bar} ${count}`;
  });
  const lossBar = losses === 0
    ? emptyMark
    : fullMark.repeat(Math.max(1, Math.round((losses / Math.max(max, losses)) * 12)));
  rows.push(`${lossMark} ${lossBar} ${losses}`);
  return rows;
}
