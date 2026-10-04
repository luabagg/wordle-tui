import { normalizeWord } from './game';
import {
  codeToKey,
  countsEntropy,
  evalsToCode,
  patternCode,
  rankGuesses,
  SOLVED_PATTERN,
} from './solver';
import type { GuessEvaluation, PatternCode } from './solver';

/**
 * Wordle as an ID3-style decision tree: each guess is a question, each
 * feedback pattern is a branch, and the split criterion is information gain
 * (pattern entropy) under a uniform prior over the remaining answers.
 */

export interface DecisionStep {
  guess: string;
  pattern: string;
  candidatesBefore: number;
  candidatesAfter: number;
  /** log2(before / after). Null when no answer matches the feedback. */
  bitsGained: number | null;
}

export interface SplitBranch {
  pattern: string;
  count: number;
  probability: number;
  /** Information this branch reveals: -log2(probability). */
  bits: number;
  /** Greedy follow-up question. Null for the solved branch. */
  nextGuess: string | null;
}

export interface DecisionSplit {
  guess: string;
  candidates: number;
  /** Expected information gain in bits. */
  entropy: number;
  /** Expected candidates left after the guess: sum(n_i^2) / n. */
  expectedRemaining: number;
  /** Sorted by count, largest first. */
  branches: SplitBranch[];
}

export interface SolveEstimate {
  /** Mean guesses to solve, counting the next guess, for the greedy tree. */
  expectedGuesses: number;
  worstCaseGuesses: number;
}

export interface DecisionPlan {
  split: DecisionSplit;
  estimate: SolveEstimate;
}

export function uncertaintyBits(candidates: number): number {
  return candidates > 0 ? Math.log2(candidates) : 0;
}

/** Filter answers step by step and record what each guess revealed. */
export function traceDecisionPath(
  answerKeys: string[],
  history: GuessEvaluation[],
): { path: DecisionStep[]; candidates: string[] } {
  const path: DecisionStep[] = [];
  let candidates = answerKeys;
  for (const step of history) {
    const guess = normalizeWord(step.guess);
    const code = evalsToCode(step.evals);
    const next = candidates.filter((answer) => patternCode(guess, answer) === code);
    path.push({
      guess,
      pattern: codeToKey(code),
      candidatesBefore: candidates.length,
      candidatesAfter: next.length,
      bitsGained: next.length > 0 ? Math.log2(candidates.length / next.length) : null,
    });
    candidates = next;
  }
  return { path, candidates };
}

function groupByPattern(guess: string, candidates: string[]): Map<PatternCode, string[]> {
  const groups = new Map<PatternCode, string[]>();
  for (const answer of candidates) {
    const code = patternCode(guess, answer);
    const group = groups.get(code);
    if (group) group.push(answer);
    else groups.set(code, [answer]);
  }
  return groups;
}

interface NodePlan {
  guess: string;
  estimate: SolveEstimate;
}

/** Plan every unsolved branch below one question. */
function planChildren(groups: Map<PatternCode, string[]>): Map<PatternCode, NodePlan> {
  const children = new Map<PatternCode, NodePlan>();
  for (const [code, group] of groups) {
    if (code !== SOLVED_PATTERN) children.set(code, planNode(group));
  }
  return children;
}

/** One question plus its weighted subtrees. */
function combineEstimate(
  groups: Map<PatternCode, string[]>,
  children: Map<PatternCode, NodePlan>,
  total: number,
): SolveEstimate {
  let expectedTail = 0;
  let worstTail = 0;
  for (const [code, child] of children) {
    const weight = (groups.get(code)?.length ?? 0) / total;
    expectedTail += weight * child.estimate.expectedGuesses;
    worstTail = Math.max(worstTail, child.estimate.worstCaseGuesses);
  }
  return { expectedGuesses: 1 + expectedTail, worstCaseGuesses: 1 + worstTail };
}

/**
 * Greedy ID3 node. The guess pool is the node's own candidates, so the guess
 * always isolates itself and every other branch is strictly smaller.
 */
function planNode(candidates: string[]): NodePlan {
  if (candidates.length === 1) {
    return { guess: candidates[0], estimate: { expectedGuesses: 1, worstCaseGuesses: 1 } };
  }
  const guess = rankGuesses(candidates, candidates)[0].guess;
  const groups = groupByPattern(guess, candidates);
  return { guess, estimate: combineEstimate(groups, planChildren(groups), candidates.length) };
}

function buildSplit(
  guess: string,
  candidates: string[],
  groups: Map<PatternCode, string[]>,
  nextGuessFor: (code: PatternCode) => string | null,
): DecisionSplit {
  const total = candidates.length;
  const counts = Array.from(groups.values(), (group) => group.length);
  const branches = Array.from(groups, ([code, group]): SplitBranch => {
    const probability = group.length / total;
    return {
      pattern: codeToKey(code),
      count: group.length,
      probability,
      bits: -Math.log2(probability),
      nextGuess: nextGuessFor(code),
    };
  }).sort((a, b) => b.count - a.count || (a.pattern < b.pattern ? -1 : 1));

  return {
    guess,
    candidates: total,
    entropy: countsEntropy(counts, total),
    expectedRemaining: counts.reduce((sum, count) => sum + count * count, 0) / total,
    branches,
  };
}

/**
 * Split the candidates by `guess`, then expand the greedy tree below each
 * branch to name its next question and estimate the guesses to solve.
 * Each child node ranks only its own branch, so the cost is about
 * sum(branch^2) per level. Measured 6-15 ms for the full EN/PT answer lists.
 */
export function planDecision(guess: string, candidates: string[]): DecisionPlan | null {
  if (candidates.length === 0) return null;
  const groups = groupByPattern(guess, candidates);
  const children = planChildren(groups);
  return {
    split: buildSplit(guess, candidates, groups, (code) => children.get(code)?.guess ?? null),
    estimate: combineEstimate(groups, children, candidates.length),
  };
}
