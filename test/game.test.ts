import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, evaluateGuess, TILE } from '../src/game';

test('evaluateGuess marks repeated letters correctly', () => {
  const result = evaluateGuess('eerie', 'sweep');
  assert.deepEqual(result, [TILE.PRESENT, TILE.PRESENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT]);
});

test('game wins on correct guess', () => {
  const game = createGame('crane', ['crane', 'adieu']);
  for (const ch of 'crane') game.addLetter(ch);
  const submitted = game.submitGuess();
  assert.equal(submitted, true);
  assert.equal(game.state.status, 'won');
});

test('invalid word is rejected', () => {
  const game = createGame('crane', ['crane', 'adieu']);
  for (const ch of 'xxxxx') game.addLetter(ch);
  const submitted = game.submitGuess();
  assert.equal(submitted, false);
  assert.equal(game.state.message, 'Word not in list.');
});
