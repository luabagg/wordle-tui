import type { Language } from './i18n';
import type { TileState } from './game';
import { TILE } from './game';
import {
  filterCandidates,
  rankGuesses,
  type GuessEvaluation,
  type GuessScore,
} from './solver';

export type TipsStatus = 'ready' | 'computing';

export interface TipsSnapshot {
  candidates: string[];
  ranked: GuessScore[];
  bestCandidate: string | null;
  status: TipsStatus;
  /** language + history fingerprint used for cache keys */
  cacheKey: string;
}

export interface SelectTipsArgs {
  language: Language;
  history: Array<{ guess: string; evaluation: TileState[] } | GuessEvaluation>;
  answerKeys: string[];
  allWords: Record<string, string> | string[];
  limit?: number;
}

export interface RankAsyncOptions {
  chunkSize?: number;
  signal?: AbortSignal;
  onPartial?: (ranked: GuessScore[]) => void;
  /** Yield to the event loop between chunks so quit/back can run. */
  yieldFn?: () => Promise<void>;
}

interface PreparedTips {
  cacheKey: string;
  candidates: string[];
  candidateSet: Set<string>;
  guessPool: string[];
  limit?: number;
}

/**
 * Above this candidate count, TUI prefers cooperative async ranking.
 * Measured ~4s cold rank for full EN answer list (~2500) on Bun; after one
 * informative guess candidates usually drop far below this threshold.
 */
export const TIPS_ASYNC_CANDIDATE_THRESHOLD = 200;

const DEFAULT_CHUNK = 32;

function abortError(): Error {
  const error = new Error('tips ranking aborted');
  error.name = 'AbortError';
  return error;
}

function evalsToKey(evals: TileState[]): string {
  return evals.map((e) => {
    if (e === TILE.CORRECT) return 'C';
    if (e === TILE.PRESENT) return 'P';
    return 'A';
  }).join('');
}

function asHistory(history: SelectTipsArgs['history']): GuessEvaluation[] {
  return history.map((entry) => {
    if ('evaluation' in entry) {
      return { guess: entry.guess, evals: entry.evaluation };
    }
    return entry;
  });
}

export function tipsHistoryFingerprint(
  language: Language,
  history: SelectTipsArgs['history'],
): string {
  const normalized = asHistory(history)
    .map((entry) => `${entry.guess}:${evalsToKey(entry.evals)}`)
    .join('|');
  return `${language}|${normalized}`;
}

function acceptedWordKeys(allWords: Record<string, string> | string[]): string[] {
  return Array.isArray(allWords) ? allWords : Object.keys(allWords);
}

/** Shared pure filtering/pool policy for synchronous MCP and asynchronous TUI. */
function prepareTips(args: SelectTipsArgs): PreparedTips {
  const history = asHistory(args.history);
  const candidates = filterCandidates(args.answerKeys, history);
  return {
    cacheKey: tipsHistoryFingerprint(args.language, history),
    candidates,
    candidateSet: new Set(candidates),
    guessPool: candidates.length > 0
      ? args.answerKeys
      : acceptedWordKeys(args.allWords),
    limit: args.limit,
  };
}

/**
 * Shared pure O(n) snapshot policy. Because the candidate-first guess pool
 * contains every answer key, the first candidate in the already entropy-sorted
 * result is exactly the highest-ranked remaining candidate. No second O(n²)
 * candidate ranking pass is needed.
 */
function finalizeTips(prepared: PreparedTips, rankedFull: GuessScore[]): TipsSnapshot {
  const ranked = prepared.limit && prepared.limit > 0
    ? rankedFull.slice(0, prepared.limit)
    : rankedFull;
  const bestCandidate = prepared.candidates.length === 0
    ? null
    : rankedFull.find((score) => prepared.candidateSet.has(score.guess))?.guess
      ?? prepared.candidates[0]
      ?? null;

  return {
    candidates: prepared.candidates,
    ranked,
    bestCandidate,
    status: 'ready',
    cacheKey: prepared.cacheKey,
  };
}

/**
 * Canonical tips selector used by MCP and as the synchronous TUI fast path.
 * Candidate-first policy: rank answer keys while candidates remain; only fall
 * back to accepted-word keys when no answer candidate matches history.
 */
export function selectTips(args: SelectTipsArgs): TipsSnapshot {
  const prepared = prepareTips(args);
  return finalizeTips(prepared, rankGuesses(prepared.guessPool, prepared.candidates));
}

/** Immediate placeholder shown while async ranking runs. */
export function tipsComputingPlaceholder(args: SelectTipsArgs): TipsSnapshot {
  const prepared = prepareTips(args);
  return {
    candidates: prepared.candidates,
    ranked: [],
    bestCandidate: null,
    status: 'computing',
    cacheKey: prepared.cacheKey,
  };
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Cooperative ranking that yields between chunks so UI can process quit/back.
 * Final sort order matches `rankGuesses` for the same inputs.
 */
export async function rankGuessesAsync(
  guesses: string[],
  candidates: string[],
  options: RankAsyncOptions = {},
): Promise<GuessScore[]> {
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK);
  const yieldFn = options.yieldFn ?? defaultYield;
  const scored: GuessScore[] = [];

  for (let index = 0; index < guesses.length; index += 1) {
    if (options.signal?.aborted) throw abortError();
    const [score] = rankGuesses([guesses[index]], candidates);
    scored.push(score ?? {
      guess: guesses[index],
      entropy: 0,
      topPattern: '',
      topPatternCount: 0,
    });
    if ((index + 1) % chunkSize === 0 || index === guesses.length - 1) {
      const partial = scored.slice().sort((a, b) => b.entropy - a.entropy);
      options.onPartial?.(partial);
      // Check after callbacks even on the final chunk, before finalization.
      if (options.signal?.aborted) throw abortError();
      if (index < guesses.length - 1) await yieldFn();
    }
  }

  return scored.sort((a, b) => b.entropy - a.entropy);
}

/** Same pure preparation/finalization as selectTips; ranking is cooperative. */
export async function selectTipsAsync(
  args: SelectTipsArgs,
  options: RankAsyncOptions = {},
): Promise<TipsSnapshot> {
  const prepared = prepareTips(args);
  const rankedFull = await rankGuessesAsync(
    prepared.guessPool,
    prepared.candidates,
    options,
  );
  if (options.signal?.aborted) throw abortError();
  return finalizeTips(prepared, rankedFull);
}

export function emptyTipsSnapshot(language: Language = 'en'): TipsSnapshot {
  return {
    candidates: [],
    ranked: [],
    bestCandidate: null,
    status: 'ready',
    cacheKey: `${language}|`,
  };
}

export function shouldComputeTipsAsync(candidateCount: number): boolean {
  return candidateCount > TIPS_ASYNC_CANDIDATE_THRESHOLD;
}
