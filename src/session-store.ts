import fs from 'node:fs';
import path from 'node:path';
import type { EditableGuess, GameStatus, TileState } from './game';
import { WORD_LENGTH, cloneSlots, createEmptySlots } from './game';
import type { Language } from './i18n';

export const STATS_SCHEMA_VERSION = 3;

export type PuzzleMode = 'daily' | 'practice';

export interface AppSettings {
  hardModeDefault: boolean;
}

export interface ActivePuzzle {
  dailyId: string;
  language: Language;
  guesses: string[];
  evaluations: TileState[][];
  slots: EditableGuess;
  cursorPosition: number;
  status: GameStatus;
  hardMode: boolean;
  mode: PuzzleMode;
}

export interface AtomicWriteOptions {
  /** Keep a last-known-good sibling backup before replacing the target. */
  backup?: boolean;
}

export interface ReadJsonResult<T> {
  value: T | null;
  /** Missing file (ENOENT) vs unreadable/malformed content. */
  status: 'missing' | 'ok' | 'malformed' | 'recovered';
  warning?: string;
  source?: 'primary' | 'backup';
}

function backupPathFor(filePath: string): string {
  return `${filePath}.bak`;
}

function tempPathFor(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
}

/** Same-directory temp write → optional fsync → rename, with last-known-good backup. */
export function atomicWriteFile(filePath: string, content: string, options: AtomicWriteOptions = {}): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = tempPathFor(filePath);
  const bakPath = backupPathFor(filePath);
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeFileSync(fd, content);
    try {
      fs.fsyncSync(fd);
    } catch {
      // fsync may be unavailable on some platforms/filesystems; rename still provides atomicity.
    }
  } finally {
    fs.closeSync(fd);
  }

  const primaryExisted = fs.existsSync(filePath);
  if (options.backup !== false && primaryExisted) {
    try {
      // Keep the previous primary as last-known-good before replacing it.
      fs.copyFileSync(filePath, bakPath);
    } catch {
      // Backup is best-effort; primary rename still proceeds.
    }
  }

  fs.renameSync(tempPath, filePath);

  // First successful write has no previous version; seed a recovery copy of the new primary.
  if (options.backup !== false && !primaryExisted) {
    try {
      fs.copyFileSync(filePath, bakPath);
    } catch {
      // Best-effort only.
    }
  }
}

export function atomicWriteJson(filePath: string, value: unknown, options: AtomicWriteOptions = {}): void {
  atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

function parseJsonText(text: string): unknown {
  return JSON.parse(text);
}

function readTextFile(filePath: string): { ok: true; text: string } | { ok: false; code?: string } {
  try {
    return { ok: true, text: fs.readFileSync(filePath, 'utf8') };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { ok: false, code };
  }
}

/**
 * Read a JSON document with missing/malformed distinction and last-known-good recovery.
 * Does not invent defaults — callers map `value: null` to domain defaults.
 */
export function readJsonDocument(filePath: string): ReadJsonResult<unknown> {
  const primary = readTextFile(filePath);
  if (!primary.ok) {
    if (primary.code === 'ENOENT') {
      const backup = tryReadBackup(filePath);
      if (backup) return backup;
      return { value: null, status: 'missing' };
    }
    const backup = tryReadBackup(filePath);
    if (backup) return backup;
    return {
      value: null,
      status: 'malformed',
      warning: `Could not read saved state at ${filePath}.`,
    };
  }

  try {
    return { value: parseJsonText(primary.text), status: 'ok', source: 'primary' };
  } catch {
    const backup = tryReadBackup(filePath);
    if (backup) return backup;
    return {
      value: null,
      status: 'malformed',
      warning: `Saved state at ${filePath} is unreadable. Progress may be incomplete.`,
    };
  }
}

function tryReadBackup(filePath: string): ReadJsonResult<unknown> | null {
  const bak = backupPathFor(filePath);
  const backup = readTextFile(bak);
  if (!backup.ok) return null;
  try {
    return {
      value: parseJsonText(backup.text),
      status: 'recovered',
      source: 'backup',
      warning: `Recovered saved state from backup at ${bak}.`,
    };
  } catch {
    return null;
  }
}

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'pt';
}

function isGameStatus(value: unknown): value is GameStatus {
  return value === 'playing' || value === 'won' || value === 'lost';
}

function isTileState(value: unknown): value is TileState {
  return value === 'empty' || value === 'absent' || value === 'present' || value === 'correct';
}

function normalizeSlots(value: unknown): EditableGuess {
  if (!Array.isArray(value) || value.length !== WORD_LENGTH) return createEmptySlots();
  const slots: [string | null, string | null, string | null, string | null, string | null] = [
    null, null, null, null, null,
  ];
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const slot = value[i];
    if (slot === null || slot === undefined || slot === '') {
      slots[i] = null;
    } else if (typeof slot === 'string' && /^[a-z]$/i.test(slot)) {
      slots[i] = slot.toLowerCase();
    } else {
      slots[i] = null;
    }
  }
  return cloneSlots(slots);
}

function normalizeEvaluations(value: unknown): TileState[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => Array.isArray(row) && row.length === WORD_LENGTH)
    .map((row) => (row as unknown[]).map((cell) => (isTileState(cell) ? cell : 'absent')));
}

/** Parse a single active puzzle; returns null when required fields are invalid. */
export function normalizeActivePuzzle(value: unknown, languageHint?: Language): ActivePuzzle | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const language = isLanguage(raw.language) ? raw.language : languageHint;
  if (!language) return null;
  if (typeof raw.dailyId !== 'string' || raw.dailyId.length === 0) return null;
  if (!isGameStatus(raw.status)) return null;
  if (!Array.isArray(raw.guesses)) return null;

  const guesses = raw.guesses.filter((g): g is string => typeof g === 'string');
  const evaluations = normalizeEvaluations(raw.evaluations);
  if (evaluations.length !== guesses.length) {
    // Prefer guess count; drop mismatched evaluation tail/head by aligning length.
    while (evaluations.length < guesses.length) {
      evaluations.push(['absent', 'absent', 'absent', 'absent', 'absent']);
    }
    evaluations.length = guesses.length;
  }

  const cursorRaw = Number(raw.cursorPosition);
  const cursorPosition = Number.isFinite(cursorRaw)
    ? Math.max(0, Math.min(WORD_LENGTH, Math.trunc(cursorRaw)))
    : 0;

  const mode: PuzzleMode = raw.mode === 'practice' ? 'practice' : 'daily';

  return {
    dailyId: raw.dailyId,
    language,
    guesses,
    evaluations,
    slots: normalizeSlots(raw.slots),
    cursorPosition,
    status: raw.status,
    hardMode: Boolean(raw.hardMode),
    mode,
  };
}

export function normalizeActiveByLanguage(
  value: unknown,
): { active: Partial<Record<Language, ActivePuzzle>>; warning?: string } {
  if (value == null) return { active: {} };
  if (!value || typeof value !== 'object') {
    return { active: {}, warning: 'Active session data was invalid and was discarded.' };
  }

  const active: Partial<Record<Language, ActivePuzzle>> = {};
  let warning: string | undefined;
  for (const language of ['en', 'pt'] as const) {
    const raw = (value as Record<string, unknown>)[language];
    if (raw == null) continue;
    const puzzle = normalizeActivePuzzle(raw, language);
    if (puzzle) {
      active[language] = { ...puzzle, language };
    } else {
      warning = 'Some in-progress games could not be restored.';
    }
  }
  return { active, warning };
}

export function normalizeArchivedActive(
  value: unknown,
): Record<string, ActivePuzzle> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, ActivePuzzle> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const puzzle = normalizeActivePuzzle(raw);
    if (puzzle) out[key] = puzzle;
  }
  return out;
}

export function hasActiveProgress(puzzle: Pick<ActivePuzzle, 'guesses' | 'slots' | 'status'>): boolean {
  if (puzzle.status !== 'playing') return true;
  if (puzzle.guesses.length > 0) return true;
  return puzzle.slots.some((slot) => slot !== null);
}

export function activePuzzleFromGame(args: {
  dailyId: string;
  language: Language;
  guesses: string[];
  evaluations: TileState[][];
  slots: EditableGuess;
  cursorPosition: number;
  status: GameStatus;
  hardMode?: boolean;
  mode?: PuzzleMode;
}): ActivePuzzle {
  return {
    dailyId: args.dailyId,
    language: args.language,
    guesses: [...args.guesses],
    evaluations: args.evaluations.map((row) => [...row]),
    slots: cloneSlots(args.slots),
    cursorPosition: args.cursorPosition,
    status: args.status,
    hardMode: Boolean(args.hardMode),
    mode: args.mode ?? 'daily',
  };
}

export function defaultSettings(): AppSettings {
  return { hardModeDefault: false };
}

export function normalizeSettings(value: unknown): AppSettings {
  const defaults = defaultSettings();
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Record<string, unknown>;
  return {
    hardModeDefault: Boolean(raw.hardModeDefault),
  };
}
