import { evaluateGuess, normalizeWord, TileState, TILE, WORD_LENGTH } from './game';

export interface GuessEvaluation {
  guess: string;
  evals: TileState[];
}

export interface GuessScore {
  guess: string;
  entropy: number;
  topPattern: string;
  topPatternCount: number;
}

export function patternKey(guess: string, answer: string): string {
  const evals = evaluateGuess(guess, answer);
  return evalsToKey(evals);
}

function evalsToKey(evals: TileState[]): string {
  return evals.map((e) => {
    if (e === TILE.CORRECT) return 'C';
    if (e === TILE.PRESENT) return 'P';
    return 'A';
  }).join('');
}

export function normalizeAll(words: string[]): string[] {
  return words.map(normalizeWord);
}

export function filterCandidates(candidates: string[], history: GuessEvaluation[]): string[] {
  return candidates.filter((candidate) => {
    for (const { guess, evals } of history) {
      if (patternKey(guess, candidate) !== evalsToKey(evals)) {
        return false;
      }
    }
    return true;
  });
}

function bucketsForGuess(guess: string, candidates: string[]): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const answer of candidates) {
    const key = patternKey(guess, answer);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return buckets;
}

export function entropyOfGuess(guess: string, candidates: string[]): number {
  const buckets = bucketsForGuess(guess, candidates);
  const total = candidates.length;
  if (total === 0) return 0;

  let entropy = 0;
  for (const count of buckets.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function rankGuesses(guesses: string[], candidates: string[]): GuessScore[] {
  const scored: GuessScore[] = [];
  const total = candidates.length || 1;

  for (const guess of guesses) {
    const buckets = bucketsForGuess(guess, candidates);
    let entropy = 0;
    let topPattern = '';
    let topPatternCount = 0;

    for (const [key, count] of buckets) {
      const p = count / total;
      entropy -= p * Math.log2(p);
      if (count > topPatternCount) {
        topPatternCount = count;
        topPattern = key;
      }
    }

    scored.push({ guess, entropy, topPattern, topPatternCount });
  }

  return scored.sort((a, b) => b.entropy - a.entropy);
}

export function bestWinProbabilityGuess(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const ranked = rankGuesses(candidates, candidates);
  return ranked[0]?.guess ?? null;
}
