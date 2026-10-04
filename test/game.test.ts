import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, evaluateGuess, normalizeWord, TILE, WORD_LENGTH } from '../src/game';
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

  assert.deepEqual(game.state.slots, ['t', 'e', 'r', 'm', 'o']);
  assert.equal(game.state.cursorPosition, 5);

  game.moveCursor(-3);
  assert.equal(game.state.cursorPosition, 2);
  game.addLetter('x');
  assert.deepEqual(game.state.slots, ['t', 'e', 'x', 'm', 'o']);
  assert.equal(game.state.cursorPosition, 3);

  game.setCursorPosition(5);
  game.backspace();
  assert.deepEqual(game.state.slots, ['t', 'e', 'x', 'm', null]);
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

test('sparse editor writes into the selected slot', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane', 'slate'], language: 'en' });
  game.moveCursor(3);
  game.addLetter('a');
  assert.deepEqual(game.state.slots, [null, null, null, 'a', null]);
  assert.equal(game.state.cursorPosition, 4);
});

test('slot replacement never shifts neighboring letters', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane', 'slate'], language: 'en' });
  assert.deepEqual(game.setCurrentGuess('slate'), { ok: true });

  game.setCursorPosition(0);
  game.addLetter('c');
  game.setCursorPosition(2);
  game.addLetter('o');
  game.setCursorPosition(4);
  game.addLetter('e');

  assert.deepEqual(game.state.slots, ['c', 'l', 'o', 't', 'e']);
});

test('submission rejects sparse rows without mutating submitted history', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane', 'slate'], language: 'en' });
  game.setCursorPosition(1);
  for (const letter of 'late') game.addLetter(letter);
  const before = [...game.state.slots];

  assert.equal(game.submitGuess(), false);
  assert.deepEqual(game.state.slots, before);
  assert.deepEqual(game.state.guesses, []);
  assert.deepEqual(game.state.evaluations, []);
});

test('Home, End, and cursor movement support the full sparse row', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane'], language: 'en' });
  game.setCursorPosition('end');
  assert.equal(game.state.cursorPosition, 0);

  game.moveCursor(99);
  assert.equal(game.state.cursorPosition, WORD_LENGTH);
  game.addLetter('a');
  assert.deepEqual(game.state.slots, [null, null, null, null, 'a']);
  assert.equal(game.state.cursorPosition, WORD_LENGTH);

  game.setCursorPosition('end');
  assert.equal(game.state.cursorPosition, WORD_LENGTH);
  game.setCursorPosition(0);
  assert.equal(game.state.cursorPosition, 0);
  game.moveCursor(-99);
  assert.equal(game.state.cursorPosition, 0);
});

test('End moves to the first trailing null on a partial row', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane'], language: 'en' });
  game.setCursorPosition(3);
  game.addLetter('a');
  game.setCursorPosition(0);
  game.setCursorPosition('end');
  assert.equal(game.state.cursorPosition, 4);
});

test('Backspace and Delete clear distinct slots without shifting', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane', 'slate'], language: 'en' });
  game.setCurrentGuess('slate');

  game.setCursorPosition(2);
  game.backspace();
  assert.deepEqual(game.state.slots, ['s', null, 'a', 't', 'e']);
  assert.equal(game.state.cursorPosition, 1);

  game.setCursorPosition(3);
  game.deleteSlot();
  assert.deepEqual(game.state.slots, ['s', null, 'a', null, 'e']);
  assert.equal(game.state.cursorPosition, 3);

  game.setCursorPosition(WORD_LENGTH);
  game.deleteSlot();
  assert.deepEqual(game.state.slots, ['s', null, 'a', null, 'e']);
  game.backspace();
  assert.deepEqual(game.state.slots, ['s', null, 'a', null, null]);
  assert.equal(game.state.cursorPosition, 4);
});

test('Backspace and Delete are no-ops at empty boundaries', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane'], language: 'en' });
  game.backspace();
  game.deleteSlot();
  assert.deepEqual(game.state.slots, [null, null, null, null, null]);
  assert.equal(game.state.cursorPosition, 0);
});

test('setCurrentGuess validates and replaces the editable row atomically', () => {
  const game = createGame({ answer: 'sabio', dictionary: { sabio: 'sábio', termo: 'termo' }, language: 'pt' });
  game.setCursorPosition(2);
  game.addLetter('x');
  const before = game.captureEditableRow();

  assert.deepEqual(game.setCurrentGuess('abc'), { ok: false, error: { code: 'invalid_length' } });
  assert.deepEqual(game.captureEditableRow(), before);
  assert.deepEqual(game.setCurrentGuess('abcdef'), { ok: false, error: { code: 'invalid_length' } });
  assert.deepEqual(game.captureEditableRow(), before);
  assert.deepEqual(game.setCurrentGuess('ab3de'), { ok: false, error: { code: 'invalid_chars' } });
  assert.deepEqual(game.captureEditableRow(), before);

  assert.deepEqual(game.setCurrentGuess('sábio'), { ok: true });
  assert.deepEqual(game.state.slots, ['s', 'a', 'b', 'i', 'o']);
  assert.equal(game.state.cursorPosition, WORD_LENGTH);
});

test('setCurrentGuess rejects finished games without mutation', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane'], language: 'en' });
  game.setCurrentGuess('crane');
  game.submitGuess();
  const before = game.captureEditableRow();

  assert.deepEqual(game.setCurrentGuess('crane'), { ok: false, error: { code: 'game_over' } });
  assert.deepEqual(game.captureEditableRow(), before);
  assert.equal(game.state.status, 'won');
});

test('hard mode rejects guesses that break fixed greens', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane', 'trace', 'slate', 'crate', 'stare'],
    language: 'en',
    hardMode: true,
  });
  game.setCurrentGuess('trace');
  assert.equal(game.submitGuess(), true);
  // TRACE vs CRANE locks R/A/E in positions 2/3/5 (1-based). STARE breaks position 2.
  game.setCurrentGuess('stare');
  assert.equal(game.submitGuess(), false);
  assert.match(game.state.message, /Hard mode: position 2 must be R/i);
  assert.deepEqual(game.state.guesses, ['trace']);
  assert.equal(game.state.status, 'playing');
  assert.deepEqual(game.state.slots, ['s', 't', 'a', 'r', 'e']);
});

test('hard mode requires revealed present letters to reappear', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane', 'laser', 'point'],
    language: 'en',
    hardMode: true,
  });
  game.setCurrentGuess('laser');
  assert.equal(game.submitGuess(), true);
  // LASER vs CRANE reveals A/R/E as present (no greens). POINT omits them.
  game.setCurrentGuess('point');
  assert.equal(game.submitGuess(), false);
  assert.match(game.state.message, /Hard mode: guess must include/i);
  assert.deepEqual(game.state.guesses, ['laser']);
  assert.deepEqual(game.state.slots, ['p', 'o', 'i', 'n', 't']);
});

test('hard mode enforces multi-letter multiplicity across prior reveals', () => {
  // GEESE vs EERIE reveals three E tiles (correct/present).
  const game = createGame({
    answer: 'eerie',
    dictionary: ['eerie', 'geese', 'steel', 'heave'],
    language: 'en',
    hardMode: true,
  });
  game.setCurrentGuess('geese');
  assert.equal(game.submitGuess(), true);
  // HEAVE preserves green E positions 2 and 5 but has only two Es, not the three revealed.
  game.setCurrentGuess('heave');
  assert.equal(game.submitGuess(), false);
  assert.match(game.state.message, /Hard mode: guess must include E/i);
  assert.deepEqual(game.state.guesses, ['geese']);
});

test('hard mode accepts legal reuse of greens and yellows', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane', 'trace', 'crate'],
    language: 'en',
    hardMode: true,
  });
  game.setCurrentGuess('trace');
  assert.equal(game.submitGuess(), true);
  game.setCurrentGuess('crane');
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');
});

test('hard mode can be toggled mid-game without clearing history', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane', 'slate', 'point'],
    language: 'en',
    hardMode: false,
  });
  game.setCurrentGuess('slate');
  assert.equal(game.submitGuess(), true);
  game.setHardMode(true);
  game.setCurrentGuess('point');
  assert.equal(game.submitGuess(), false);
  assert.match(game.state.message, /Hard mode/i);
});

test('practice mode allows more than six guesses and wins without a hard max', () => {
  const dictionary = [
    'aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff', 'crane',
  ];
  const game = createGame({
    answer: 'crane',
    dictionary,
    language: 'en',
    mode: 'practice',
    maxGuesses: Number.POSITIVE_INFINITY,
  });
  for (const word of ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff']) {
    game.setCurrentGuess(word);
    assert.equal(game.submitGuess(), true);
    assert.equal(game.state.status, 'playing');
  }
  assert.equal(game.state.guesses.length, 6);
  game.setCurrentGuess('crane');
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');
  assert.equal(game.state.guesses.length, 7);
});

test('undoLatestGuess restores keyboard rank and reopens play', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane', 'slate', 'trace'],
    language: 'en',
  });
  game.setCurrentGuess('slate');
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.keyState.get('a'), TILE.CORRECT);
  game.setCurrentGuess('trace');
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.keyState.get('c'), TILE.PRESENT);

  const undone = game.undoLatestGuess();
  assert.equal(undone.ok, true);
  assert.deepEqual(game.state.guesses, ['slate']);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.keyState.get('c'), undefined);
  assert.equal(game.state.keyState.get('a'), TILE.CORRECT);
  assert.deepEqual(game.state.slots, [null, null, null, null, null]);
});

test('undoLatestGuess can reopen a just-finished practice win', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane'],
    language: 'en',
    mode: 'practice',
  });
  game.setCurrentGuess('crane');
  assert.equal(game.submitGuess(), true);
  assert.equal(game.state.status, 'won');
  assert.equal(game.undoLatestGuess().ok, true);
  assert.equal(game.state.status, 'playing');
  assert.deepEqual(game.state.guesses, []);
});

test('undoLatestGuess is a no-op when history is empty', () => {
  const game = createGame({
    answer: 'crane',
    dictionary: ['crane'],
    language: 'en',
  });
  assert.deepEqual(game.undoLatestGuess(), { ok: false, reason: 'empty' });
});
