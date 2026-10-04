import { normalizeWord, TILE, WORD_LENGTH } from './game';
import type { TileState } from './game';

export interface GuessEvaluation {
  guess: string;
  evals: TileState[];
}

export interface GuessScore {
  guess: string;
  entropy: number;
  topPattern: string;
  topPatternCount: number;
  /** True when the guess is still a possible answer, so it can win now. */
  isCandidate: boolean;
}

/**
 * Feedback pattern as a base-3 integer: digit i is 0 absent, 1 present,
 * 2 correct, with weight 3^i. Range 0..242.
 */
export type PatternCode = number;

const POW3 = [1, 3, 9, 27, 81] as const;
export const PATTERN_COUNT = 243;
export const SOLVED_PATTERN: PatternCode = 242;
const ENTROPY_EPSILON = 1e-9;

// Reused letter counters. patternCode is synchronous, so one buffer is safe.
const letterCounts = new Uint8Array(26);

/**
 * Same result as evaluateGuess for normalized five-letter keys, without
 * allocation. Both arguments must be lowercase ASCII keys.
 */
export function patternCode(guess: string, answer: string): PatternCode {
  let greens = 0;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const answerChar = answer.charCodeAt(i) - 97;
    if (guess.charCodeAt(i) - 97 === answerChar) greens |= 1 << i;
    else letterCounts[answerChar] += 1;
  }

  let code = 0;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (greens & (1 << i)) {
      code += 2 * POW3[i];
      continue;
    }
    const guessChar = guess.charCodeAt(i) - 97;
    if (letterCounts[guessChar] > 0) {
      letterCounts[guessChar] -= 1;
      code += POW3[i];
    }
  }

  for (let i = 0; i < WORD_LENGTH; i += 1) letterCounts[answer.charCodeAt(i) - 97] = 0;
  return code;
}

export function evalsToCode(evals: TileState[]): PatternCode {
  let code = 0;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (evals[i] === TILE.CORRECT) code += 2 * POW3[i];
    else if (evals[i] === TILE.PRESENT) code += POW3[i];
  }
  return code;
}

/** Readable pattern: C correct, P present, A absent. */
export function codeToKey(code: PatternCode): string {
  let key = '';
  let rest = code;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const digit = rest % 3;
    key += digit === 2 ? 'C' : digit === 1 ? 'P' : 'A';
    rest = Math.floor(rest / 3);
  }
  return key;
}

export function patternKey(guess: string, answer: string): string {
  return codeToKey(patternCode(normalizeWord(guess), normalizeWord(answer)));
}

export function normalizeAll(words: string[]): string[] {
  return words.map(normalizeWord);
}

export function filterCandidates(candidates: string[], history: GuessEvaluation[]): string[] {
  const steps = history.map(({ guess, evals }) => ({
    guess: normalizeWord(guess),
    code: evalsToCode(evals),
  }));
  return candidates.filter((candidate) => steps.every(
    ({ guess, code }) => patternCode(guess, candidate) === code,
  ));
}

/** Candidate count per feedback pattern, indexed by PatternCode. */
export function patternCounts(guess: string, candidates: string[]): Uint32Array {
  const counts = new Uint32Array(PATTERN_COUNT);
  for (const answer of candidates) counts[patternCode(guess, answer)] += 1;
  return counts;
}

/** Shannon entropy in bits of a pattern distribution over `total` candidates. */
export function countsEntropy(counts: ArrayLike<number>, total: number): number {
  if (total === 0) return 0;
  let entropy = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const count = counts[i];
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function entropyOfGuess(guess: string, candidates: string[]): number {
  return countsEntropy(patternCounts(guess, candidates), candidates.length);
}

/**
 * Fixed rank order: more information first, then guesses that can win now,
 * then a smaller worst-case branch, then alphabetical.
 */
export function compareScores(a: GuessScore, b: GuessScore): number {
  if (Math.abs(a.entropy - b.entropy) > ENTROPY_EPSILON) return b.entropy - a.entropy;
  if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
  if (a.topPatternCount !== b.topPatternCount) return a.topPatternCount - b.topPatternCount;
  return a.guess < b.guess ? -1 : a.guess > b.guess ? 1 : 0;
}

export function scoreGuess(
  guess: string,
  candidates: string[],
  candidateSet: ReadonlySet<string>,
): GuessScore {
  const counts = patternCounts(guess, candidates);
  let topCode = 0;
  for (let code = 1; code < PATTERN_COUNT; code += 1) {
    if (counts[code] > counts[topCode]) topCode = code;
  }
  return {
    guess,
    entropy: countsEntropy(counts, candidates.length),
    topPattern: counts[topCode] > 0 ? codeToKey(topCode) : '',
    topPatternCount: counts[topCode],
    isCandidate: candidateSet.has(guess),
  };
}

export function rankGuesses(guesses: string[], candidates: string[]): GuessScore[] {
  const candidateSet = new Set(candidates);
  return guesses
    .map((guess) => scoreGuess(guess, candidates, candidateSet))
    .sort(compareScores);
}

export function bestWinProbabilityGuess(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const ranked = rankGuesses(candidates, candidates);
  return ranked[0]?.guess ?? null;
}
