import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, TILE } from '../src/game';
import {
  dailyDateKey,
  dailyDescriptor,
  dailyPuzzleNumber,
  formatNextDailyCountdown,
  secondsUntilNextDaily,
} from '../src/words';
import { buildShareText, defaultStats, distributionRows, recordDailyResult } from '../src/stats';

test('buildShareText renders Termo-style result grid', () => {
  const game = createGame({ answer: 'termo', dictionary: ['sábio', 'termo'], language: 'pt' });
  for (const ch of 'sabio') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  assert.equal(buildShareText(game.state, 1634, 1), [
    'joguei term.ooo #1634 *2/6 🔥 1',
    '',
    '⬛⬛⬛⬛🟩',
    '🟩🟩🟩🟩🟩',
  ].join('\n'));
});

test('buildShareText renders Wordle-style result for English', () => {
  const game = createGame({ answer: 'crane', dictionary: ['slate', 'crane'], language: 'en' });
  for (const ch of 'slate') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  for (const ch of 'crane') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  assert.equal(buildShareText(game.state, 1800, 3), [
    'Wordle 1800 2/6',
    '',
    '⬛⬛🟩⬛🟩',
    '🟩🟩🟩🟩🟩',
  ].join('\n'));
});

test('recordDailyResult stores one result per daily puzzle', () => {
  const stats = defaultStats();
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  const first = recordDailyResult(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
  const second = recordDailyResult(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });

  assert.equal(first.recorded, true);
  assert.equal(second.recorded, false);
  assert.equal(stats.gamesPlayed, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.distribution[1], 1);
});

test('recordDailyResult tracks losses in the skull distribution row', () => {
  const stats = defaultStats();
  const game = createGame({ answer: 'termo', dictionary: ['sábio', 'pedra', 'opaco', 'arroz', 'briga', 'tempo', 'termo'], language: 'pt' });
  for (const guess of ['sabio', 'pedra', 'opaco', 'arroz', 'briga', 'tempo']) {
    for (const ch of guess) game.addLetter(ch);
    assert.equal(game.submitGuess(), true);
  }

  assert.equal(game.state.status, 'lost');
  const result = recordDailyResult(stats, game.state, { id: 'pt:2026-06-25', number: 1633 });

  assert.equal(result.recorded, true);
  assert.equal(stats.gamesPlayed, 1);
  assert.equal(stats.wins, 0);
  assert.equal(stats.losses, 1);
  assert.equal(stats.currentStreak, 0);
  assert.match(distributionRows(stats).join('\n'), /☠/);
});

test('daily countdown uses São Paulo midnight for Portuguese', () => {
  const date = new Date('2026-06-24T21:30:00-03:00');

  assert.equal(dailyPuzzleNumber('pt', date), 1632);
  assert.equal(secondsUntilNextDaily('pt', date), 9_000);
  assert.equal(formatNextDailyCountdown(9_000), '2h 30m');
});

test('daily countdown uses UTC midnight for English', () => {
  const date = new Date('2026-06-24T21:30:00Z');

  assert.equal(secondsUntilNextDaily('en', date), 9_000);
  assert.equal(dailyDateKey('en', date), '2026-06-24');
  assert.ok(dailyPuzzleNumber('en', date) > 0);
});

test('dailyDescriptor is language-scoped', () => {
  const date = new Date('2026-06-24T12:00:00Z');
  const en = dailyDescriptor('en', date);
  const pt = dailyDescriptor('pt', date);

  assert.equal(en.id, `en:${dailyDateKey('en', date)}`);
  assert.equal(pt.id, `pt:${dailyDateKey('pt', date)}`);
  assert.notEqual(en.id, pt.id);
  assert.equal(en.number, dailyPuzzleNumber('en', date));
  assert.equal(pt.number, dailyPuzzleNumber('pt', date));
});

test('share text maps tile states to colored squares', () => {
  const game = createGame({ answer: 'termo', dictionary: ['metro', 'termo'], language: 'pt' });
  for (const ch of 'metro') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  const row = game.state.evaluations[0];
  assert.deepEqual(row, [TILE.PRESENT, TILE.CORRECT, TILE.PRESENT, TILE.PRESENT, TILE.CORRECT]);
  assert.match(buildShareText(game.state, 10, 0), /🟨🟩🟨🟨🟩/);
});
