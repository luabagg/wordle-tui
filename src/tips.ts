import type { Language } from './i18n';
import type { TileState } from './game';
import {
  planDecision,
  traceDecisionPath,
  uncertaintyBits,
  type DecisionPlan,
  type DecisionStep,
} from './decision-tree';
import {
  codeToKey,
  compareScores,
  evalsToCode,
  filterCandidates,
  rankGuesses,
  scoreGuess,
  type GuessEvaluation,
  type GuessScore,
} from './solver';

export type TipsStatus = 'ready' | 'computing';

export interface TipsSnapshot {
  candidates: string[];
  ranked: GuessScore[];
  bestCandidate: string | null;
  status: TipsStatus;
  /** log2 of the remaining candidate count. */
  uncertaintyBits: number;
  /** One step per submitted guess, from the full answer list. */
  path: DecisionStep[];
  /** Split and greedy plan for the top-ranked guess. Null until ranking is ready. */
  plan: DecisionPlan | null;
  /** language + hard mode + history fingerprint used for cache keys */
  cacheKey: string;
}

export interface SelectTipsArgs {
  language: Language;
  history: Array<{ guess: string; evaluation: TileState[] } | GuessEvaluation>;
  answerKeys: string[];
  allWords: Record<string, string> | string[];
  /** Hard mode limits suggestions to words that are legal to guess. */
  hardMode?: boolean;
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
  path: DecisionStep[];
  candidates: string[];
  candidateSet: Set<string>;
  guessPool: string[];
  limit?: number;
}

/**
 * Above this candidate count, TUI prefers cooperative async ranking.
 * Measured ~120 ms cold rank for the full EN answer list (2500) on Bun 1.4,
 * which is long enough to delay a keypress. After one informative guess,
 * candidates usually drop far below this threshold.
 */
export const TIPS_ASYNC_CANDIDATE_THRESHOLD = 200;

const DEFAULT_CHUNK = 32;

function abortError(): Error {
  const error = new Error('tips ranking aborted');
  error.name = 'AbortError';
  return error;
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
  hardMode = false,
): string {
  const normalized = asHistory(history)
    .map((entry) => `${entry.guess}:${codeToKey(evalsToCode(entry.evals))}`)
    .join('|');
  return `${language}|${hardMode ? 'hard' : 'normal'}|${normalized}`;
}

function acceptedWordKeys(allWords: Record<string, string> | string[]): string[] {
  return Array.isArray(allWords) ? allWords : Object.keys(allWords);
}

/**
 * Candidate-first guess pool. Normal mode ranks every answer key, because a
 * non-candidate can split better. Hard mode ranks only words consistent with
 * the history: those are exactly the words that keep every revealed hint.
 */
function guessPoolFor(
  args: SelectTipsArgs,
  history: GuessEvaluation[],
  candidates: string[],
): string[] {
  if (args.hardMode) {
    return candidates.length > 0
      ? candidates
      : filterCandidates(acceptedWordKeys(args.allWords), history);
  }
  return candidates.length > 0 ? args.answerKeys : acceptedWordKeys(args.allWords);
}

/** Shared pure filtering/pool policy for synchronous MCP and asynchronous TUI. */
function prepareTips(args: SelectTipsArgs): PreparedTips {
  const history = asHistory(args.history);
  const { path, candidates } = traceDecisionPath(args.answerKeys, history);
  return {
    cacheKey: tipsHistoryFingerprint(args.language, history, args.hardMode),
    path,
    candidates,
    candidateSet: new Set(candidates),
    guessPool: guessPoolFor(args, history, candidates),
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

  const topGuess = rankedFull[0]?.guess;
  return {
    candidates: prepared.candidates,
    ranked,
    bestCandidate,
    status: 'ready',
    uncertaintyBits: uncertaintyBits(prepared.candidates.length),
    path: prepared.path,
    plan: topGuess ? planDecision(topGuess, prepared.candidates) : null,
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
    uncertaintyBits: uncertaintyBits(prepared.candidates.length),
    path: prepared.path,
    plan: null,
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
  const candidateSet = new Set(candidates);

  for (let index = 0; index < guesses.length; index += 1) {
    if (options.signal?.aborted) throw abortError();
    scored.push(scoreGuess(guesses[index], candidates, candidateSet));
    if ((index + 1) % chunkSize === 0 || index === guesses.length - 1) {
      const partial = scored.slice().sort(compareScores);
      options.onPartial?.(partial);
      // Check after callbacks even on the final chunk, before finalization.
      if (options.signal?.aborted) throw abortError();
      if (index < guesses.length - 1) await yieldFn();
    }
  }

  return scored.sort(compareScores);
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
    uncertaintyBits: 0,
    path: [],
    plan: null,
    cacheKey: `${language}|normal|`,
  };
}

export function shouldComputeTipsAsync(candidateCount: number): boolean {
  return candidateCount > TIPS_ASYNC_CANDIDATE_THRESHOLD;
}
