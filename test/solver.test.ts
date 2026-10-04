import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCandidates, patternKey, entropyOfGuess, rankGuesses, bestWinProbabilityGuess, normalizeAll } from '../src/solver';
import { TILE } from '../src/game';

test('patternKey groups feedback by letter state', () => {
  assert.equal(patternKey('salty', 'salty'), 'CCCCC');
  assert.equal(patternKey('sabio', 'termo'), 'AAAAC');
});

test('filterCandidates narrows to words matching all evaluations', () => {
  const candidates = ['saint', 'sails', 'sabot', 'salty'];
  const result = filterCandidates(candidates, [
    { guess: 'salty', evals: [TILE.CORRECT, TILE.CORRECT, TILE.ABSENT, TILE.PRESENT, TILE.ABSENT] },
  ]);
  assert.deepEqual(result, ['saint', 'sabot']);
});

test('filterCandidates respects absent letters', () => {
  const candidates = ['apple', 'apply', 'apron'];
  const result = filterCandidates(candidates, [
    { guess: 'apple', evals: [TILE.CORRECT, TILE.CORRECT, TILE.CORRECT, TILE.CORRECT, TILE.ABSENT] },
  ]);
  assert.deepEqual(result, ['apply']);
});

test('entropyOfGuess computes non-negative expected bits', () => {
  const candidates = ['aback', 'abbey', 'abbot', 'about'];
  const info = entropyOfGuess('aahed', candidates);
  assert.ok(typeof info === 'number');
  assert.ok(info >= 0);
});

test('rankGuesses returns entropy-sorted suggestions', () => {
  const candidates = ['aback', 'abbey', 'abbot'];
  const ranked = rankGuesses(candidates, candidates);
  assert.ok(ranked.length > 0);
  assert.ok(ranked[0].entropy >= ranked[ranked.length - 1].entropy);
});

test('bestWinProbabilityGuess returns a valid candidate', () => {
  const candidates = ['apple', 'apply', 'apron'];
  const best = bestWinProbabilityGuess(candidates);
  assert.ok(best);
  assert.ok(candidates.includes(best!));
});

test('normalizeAll removes accents and lowercases', () => {
  assert.deepEqual(normalizeAll(['SÁBIO', 'TéRmO']), ['sabio', 'termo']);
});
