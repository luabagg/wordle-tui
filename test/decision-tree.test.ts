import { describe, expect, test } from 'bun:test';
import { evaluateGuess } from '../src/game';
import { planDecision, traceDecisionPath } from '../src/decision-tree';
import { loadWordBank } from '../src/dictionary';
import { codeToKey, patternCode } from '../src/solver';

describe('patternCode', () => {
  test('matches evaluateGuess for every pair in a dictionary sample, duplicates included', () => {
    const keys = loadWordBank('en').answers.map((entry) => entry.key).filter((_, i) => i % 25 === 0);
    const extra = ['geese', 'eerie', 'llama', 'sassy', 'abbey'];
    const words = [...keys, ...extra];
    for (const guess of words) {
      for (const answer of words) {
        const expected = evaluateGuess(guess, answer)
          .map((state) => (state === 'correct' ? 'C' : state === 'present' ? 'P' : 'A'))
          .join('');
        expect(codeToKey(patternCode(guess, answer))).toBe(expected);
      }
    }
  });
});

describe('traceDecisionPath', () => {
  test('records candidates and bits gained for each guess', () => {
    const answers = ['crane', 'crate', 'trace', 'slate'];
    const history = [{ guess: 'crate', evals: evaluateGuess('crate', 'crane') }];

    const { path, candidates } = traceDecisionPath(answers, history);

    expect(candidates).toEqual(['crane']);
    expect(path).toEqual([{
      guess: 'crate',
      pattern: 'CCCAC',
      candidatesBefore: 4,
      candidatesAfter: 1,
      bitsGained: 2,
    }]);
  });

  test('reports no gain when no answer matches the feedback', () => {
    const history = [{ guess: 'zzzzz', evals: evaluateGuess('crane', 'crane') }];

    const { path, candidates } = traceDecisionPath(['crane', 'slate'], history);

    expect(candidates).toEqual([]);
    expect(path[0].bitsGained).toBeNull();
  });
});

describe('planDecision', () => {
  test('splits candidates into branches with information-theory measures', () => {
    // "crane" isolates itself and every other word.
    const candidates = ['crane', 'slate', 'pious', 'bring'];

    const plan = planDecision('crane', candidates)!;

    expect(plan.split.branches.reduce((sum, branch) => sum + branch.count, 0)).toBe(4);
    expect(plan.split.entropy).toBeCloseTo(2, 10);
    expect(plan.split.expectedRemaining).toBe(1);
    const solved = plan.split.branches.find((branch) => branch.pattern === 'CCCCC');
    expect(solved).toMatchObject({ count: 1, probability: 0.25, bits: 2, nextGuess: null });
    expect(plan.split.branches.filter((b) => b.pattern !== 'CCCCC').every((b) => b.nextGuess)).toBe(true);
    // 1/4 solved now, 3/4 need exactly one more guess.
    expect(plan.estimate.expectedGuesses).toBeCloseTo(1.75, 10);
    expect(plan.estimate.worstCaseGuesses).toBe(2);
  });

  test('a non-candidate question never solves on this guess', () => {
    const plan = planDecision('zzzzz', ['crane', 'slate'])!;

    // Nothing is revealed, so the tree still needs two candidate guesses at worst.
    expect(plan.split.branches).toHaveLength(1);
    expect(plan.split.entropy).toBe(0);
    expect(plan.estimate).toEqual({ expectedGuesses: 2.5, worstCaseGuesses: 3 });
  });

  test('returns null when no candidates remain', () => {
    expect(planDecision('crane', [])).toBeNull();
  });

  test('plans the full answer list fast enough to run on the render path', () => {
    const answers = loadWordBank('en').answers.map((entry) => entry.key);
    const started = performance.now();
    const plan = planDecision('tears', answers)!;
    expect(performance.now() - started).toBeLessThan(500);
    expect(plan.estimate.expectedGuesses).toBeGreaterThan(1);
  });
});
