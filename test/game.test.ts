import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, evaluateGuess, normalizeWord, TILE } from '../src/game';
import { messages } from '../src/i18n';
import { loadWordBank } from '../src/dictionary';
import { dailyAnswer } from '../src/words';

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

test('reset throws if new answer is not in dictionary', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  assert.throws(() => game.reset('zzzzz'), /not in dictionary/);
});

test('createGame supports english config', () => {
  const game = createGame({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
  assert.equal(game.state.language, 'en');
  assert.equal(game.state.message, messages.en.dailyLoaded(1));
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

test('current guess supports cursor navigation and replacement', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo', 'texto'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);

  assert.equal(game.state.currentGuess, 'termo');
  assert.equal(game.state.cursorPosition, 5);

  game.moveCursor(-3);
  assert.equal(game.state.cursorPosition, 2);
  game.addLetter('x');
  assert.equal(game.state.currentGuess, 'texmo');
  assert.equal(game.state.cursorPosition, 3);

  game.setCursorPosition(5);
  game.backspace();
  assert.equal(game.state.currentGuess, 'texm');
  assert.equal(game.state.cursorPosition, 4);
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
  const bank = loadWordBank('pt');
  const allKeys = Object.keys(bank.allWords);
  assert.ok(allKeys.length > 10000);
  assert.ok(allKeys.includes('termo'));
  assert.equal(bank.allWords.sabio, 'sábio');

  const game = createGame({ answer: 'termo', dictionary: bank.allWords, language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');
});

test('loadWordBank loads English dictionary', () => {
  const bank = loadWordBank('en');
  const allKeys = Object.keys(bank.allWords);
  assert.equal(bank.language, 'en');
  assert.ok(allKeys.length > 10000);
  assert.ok(allKeys.includes('hello') || allKeys.includes('aahed'));
  assert.ok(bank.answers.length > 1000);
  assert.equal(bank.allWords[bank.answers[0].key], bank.answers[0].text);
});

test('daily answer is stable for a date', () => {
  const bank = loadWordBank('pt');
  const date = new Date('2026-05-20T12:00:00-03:00');

  assert.deepEqual(dailyAnswer('pt', bank.answers, date), dailyAnswer('pt', bank.answers, date));
});

test('daily answer uses Wordle epoch for English and Termo epoch for Portuguese', () => {
  const enAnswers = [{ key: 'apple', text: 'apple' }, { key: 'berry', text: 'berry' }, { key: 'crane', text: 'crane' }];
  const ptAnswers = [{ key: 'termo', text: 'termo' }, { key: 'sabio', text: 'sábio' }, { key: 'pedra', text: 'pedra' }];
  const date = new Date('2026-05-20T12:00:00-03:00');

  assert.deepEqual(dailyAnswer('en', enAnswers, date), dailyAnswer('en', enAnswers, date));
  assert.deepEqual(dailyAnswer('pt', ptAnswers, date), dailyAnswer('pt', ptAnswers, date));
  assert.notDeepEqual(dailyAnswer('en', enAnswers, date), dailyAnswer('pt', ptAnswers, date));
});

test('game can switch language and restart with a new answer', () => {
  const game = createGame({ answer: 'termo', dictionary: { termo: 'termo', sabio: 'sábio' }, language: 'pt' });
  game.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello', world: 'world' }, language: 'en' });
  assert.equal(game.state.language, 'en');
  assert.equal(game.state.answerKey, 'hello');
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.message, messages.en.gameReset);

  for (const ch of 'hello') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');

  const game2 = createGame({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
  game2.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
  for (const ch of 'termo') game2.addLetter(ch);
  assert.equal(game2.submitGuess(), false);
  assert.equal(game2.state.message, messages.en.notInDictionary);
});

test('switchLanguage rejects unsupported languages', () => {
  const game = createGame({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
  assert.throws(
    () => game.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello' }, language: JSON.parse('"fr"') }),
    /Unsupported language/
  );
});

test('switchLanguage rejects answer not in new dictionary', () => {
  const game = createGame({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
  assert.throws(
    () => game.switchLanguage({ answer: 'hello', dictionary: { world: 'world' }, language: 'en' }),
    /not in dictionary/
  );
});
