import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, evaluateGuess, normalizeWord, TILE } from '../src/game';
import { messages } from '../src/i18n';
import { dailyAnswer, loadWordBank } from '../src/words';

test('evaluateGuess marks repeated letters correctly', () => {
  const result = evaluateGuess('eerie', 'sweep');
  assert.deepEqual(result, [TILE.PRESENT, TILE.PRESENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT]);
});

test('createGame accepts language config and uses localized messages', () => {
  const game = createGame({
    answer: { key: 'termo', text: 'termo' },
    dictionary: { termo: 'termo', sabio: 'sábio' },
    language: 'pt',
  });
  assert.equal(game.state.language, 'pt');
  assert.equal(game.state.message, messages.pt.dailyLoaded(2));
});

test('createGame rejects unsupported languages', () => {
  assert.throws(
    () => createGame({ answer: 'termo', dictionary: ['termo'], language: JSON.parse('"fr"') }),
    /Unsupported language/
  );
});

test('createGame throws if answer is not in dictionary', () => {
  assert.throws(() => createGame({ answer: 'zzzzz', dictionary: ['termo'], language: 'pt' }), /not in dictionary/);
});

test('game wins on correct guess', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo', 'sábio'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  const submitted = game.submitGuess();
  assert.equal(submitted, true);
  assert.equal(game.state.status, 'won');
});

test('invalid word is rejected', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo', 'sábio'], language: 'pt' });
  for (const ch of 'xxxxx') game.addLetter(ch);
  const submitted = game.submitGuess();
  assert.equal(submitted, false);
  assert.equal(game.state.message, messages.pt.notInDictionary);
});

test('accents are normalized for guesses and restored for display', () => {
  const game = createGame({ answer: 'sábio', dictionary: ['sábio', 'termo'], language: 'pt' });
  for (const ch of 'sabio') game.addLetter(ch);

  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');
  assert.equal(game.state.guesses[0], 'sábio');
  assert.equal(normalizeWord('sábio'), 'sabio');
  assert.deepEqual(evaluateGuess('sabio', 'sábio'), [
    TILE.CORRECT,
    TILE.CORRECT,
    TILE.CORRECT,
    TILE.CORRECT,
    TILE.CORRECT,
  ]);
});

test('word bank contains a broad local dictionary', () => {
  const bank = loadWordBank();
  assert.ok(bank.words.length > 10000);
  assert.ok(bank.words.includes('termo'));
  assert.equal(bank.dictionary.sabio, 'sábio');

  const game = createGame({ answer: 'termo', dictionary: bank.dictionary, language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');
});

test('daily answer is stable for a date', () => {
  const bank = loadWordBank();
  const date = new Date('2026-05-20T12:00:00-03:00');

  assert.deepEqual(dailyAnswer(bank.answers, date), dailyAnswer(bank.answers, date));
});
