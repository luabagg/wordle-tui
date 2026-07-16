"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const game_1 = require("../src/game");
const i18n_1 = require("../src/i18n");
const dictionary_1 = require("../src/dictionary");
const words_1 = require("../src/words");
(0, node_test_1.default)('evaluateGuess marks repeated letters correctly', () => {
    const result = (0, game_1.evaluateGuess)('eerie', 'sweep');
    strict_1.default.deepEqual(result, [game_1.TILE.PRESENT, game_1.TILE.PRESENT, game_1.TILE.ABSENT, game_1.TILE.ABSENT, game_1.TILE.ABSENT]);
});
(0, node_test_1.default)('createGame accepts language config and uses localized messages', () => {
    const game = (0, game_1.createGame)({
        answer: { key: 'termo', text: 'termo' },
        dictionary: { termo: 'termo', sabio: 'sábio' },
        language: 'pt',
    });
    strict_1.default.equal(game.state.language, 'pt');
    strict_1.default.equal(game.state.message, i18n_1.messages.pt.dailyLoaded(2));
});
(0, node_test_1.default)('createGame rejects unsupported languages', () => {
    strict_1.default.throws(() => (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: JSON.parse('"fr"') }), /Unsupported language/);
});
(0, node_test_1.default)('createGame throws if answer is not in dictionary', () => {
    strict_1.default.throws(() => (0, game_1.createGame)({ answer: 'zzzzz', dictionary: ['termo'], language: 'pt' }), /not in dictionary/);
});
(0, node_test_1.default)('reset throws if new answer is not in dictionary', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    strict_1.default.throws(() => game.reset('zzzzz'), /not in dictionary/);
});
(0, node_test_1.default)('createGame supports english config', () => {
    const game = (0, game_1.createGame)({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
    strict_1.default.equal(game.state.language, 'en');
    strict_1.default.equal(game.state.message, i18n_1.messages.en.dailyLoaded(1));
});
(0, node_test_1.default)('game wins on correct guess', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo', 'sábio'], language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    const submitted = game.submitGuess();
    strict_1.default.equal(submitted, true);
    strict_1.default.equal(game.state.status, 'won');
});
(0, node_test_1.default)('invalid word is rejected', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo', 'sábio'], language: 'pt' });
    for (const ch of 'xxxxx')
        game.addLetter(ch);
    const submitted = game.submitGuess();
    strict_1.default.equal(submitted, false);
    strict_1.default.equal(game.state.message, i18n_1.messages.pt.notInDictionary);
});
(0, node_test_1.default)('current guess supports cursor navigation and replacement', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo', 'texto'], language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.state.currentGuess, 'termo');
    strict_1.default.equal(game.state.cursorPosition, 5);
    game.moveCursor(-3);
    strict_1.default.equal(game.state.cursorPosition, 2);
    game.addLetter('x');
    strict_1.default.equal(game.state.currentGuess, 'texmo');
    strict_1.default.equal(game.state.cursorPosition, 3);
    game.setCursorPosition(5);
    game.backspace();
    strict_1.default.equal(game.state.currentGuess, 'texm');
    strict_1.default.equal(game.state.cursorPosition, 4);
});
(0, node_test_1.default)('accents are normalized for guesses and restored for display', () => {
    const game = (0, game_1.createGame)({ answer: 'sábio', dictionary: ['sábio', 'termo'], language: 'pt' });
    for (const ch of 'sabio')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    strict_1.default.equal(game.state.status, 'won');
    strict_1.default.equal(game.state.guesses[0], 'sábio');
    strict_1.default.equal((0, game_1.normalizeWord)('sábio'), 'sabio');
    strict_1.default.deepEqual((0, game_1.evaluateGuess)('sabio', 'sábio'), [
        game_1.TILE.CORRECT,
        game_1.TILE.CORRECT,
        game_1.TILE.CORRECT,
        game_1.TILE.CORRECT,
        game_1.TILE.CORRECT,
    ]);
});
(0, node_test_1.default)('word bank contains a broad local dictionary', () => {
    const bank = (0, dictionary_1.loadWordBank)('pt');
    const allKeys = Object.keys(bank.allWords);
    strict_1.default.ok(allKeys.length > 10000);
    strict_1.default.ok(allKeys.includes('termo'));
    strict_1.default.equal(bank.allWords.sabio, 'sábio');
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: bank.allWords, language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    strict_1.default.equal(game.state.status, 'won');
});
(0, node_test_1.default)('loadWordBank loads English dictionary', () => {
    const bank = (0, dictionary_1.loadWordBank)('en');
    const allKeys = Object.keys(bank.allWords);
    strict_1.default.equal(bank.language, 'en');
    strict_1.default.ok(allKeys.length > 10000);
    strict_1.default.ok(allKeys.includes('hello') || allKeys.includes('aahed'));
    strict_1.default.ok(bank.answers.length > 1000);
    strict_1.default.equal(bank.allWords[bank.answers[0].key], bank.answers[0].text);
});
(0, node_test_1.default)('daily answer is stable for a date', () => {
    const bank = (0, dictionary_1.loadWordBank)('pt');
    const date = new Date('2026-05-20T12:00:00-03:00');
    strict_1.default.deepEqual((0, words_1.dailyAnswer)('pt', bank.answers, date), (0, words_1.dailyAnswer)('pt', bank.answers, date));
});
(0, node_test_1.default)('daily answer uses Wordle epoch for English and Termo epoch for Portuguese', () => {
    const enAnswers = [{ key: 'apple', text: 'apple' }, { key: 'berry', text: 'berry' }, { key: 'crane', text: 'crane' }];
    const ptAnswers = [{ key: 'termo', text: 'termo' }, { key: 'sabio', text: 'sábio' }, { key: 'pedra', text: 'pedra' }];
    const date = new Date('2026-05-20T12:00:00-03:00');
    strict_1.default.deepEqual((0, words_1.dailyAnswer)('en', enAnswers, date), (0, words_1.dailyAnswer)('en', enAnswers, date));
    strict_1.default.deepEqual((0, words_1.dailyAnswer)('pt', ptAnswers, date), (0, words_1.dailyAnswer)('pt', ptAnswers, date));
    strict_1.default.notDeepEqual((0, words_1.dailyAnswer)('en', enAnswers, date), (0, words_1.dailyAnswer)('pt', ptAnswers, date));
});
(0, node_test_1.default)('game can switch language and restart with a new answer', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: { termo: 'termo', sabio: 'sábio' }, language: 'pt' });
    game.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello', world: 'world' }, language: 'en' });
    strict_1.default.equal(game.state.language, 'en');
    strict_1.default.equal(game.state.answerKey, 'hello');
    strict_1.default.equal(game.state.status, 'playing');
    strict_1.default.equal(game.state.message, i18n_1.messages.en.gameReset);
    for (const ch of 'hello')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    strict_1.default.equal(game.state.status, 'won');
    const game2 = (0, game_1.createGame)({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
    game2.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
    for (const ch of 'termo')
        game2.addLetter(ch);
    strict_1.default.equal(game2.submitGuess(), false);
    strict_1.default.equal(game2.state.message, i18n_1.messages.en.notInDictionary);
});
(0, node_test_1.default)('switchLanguage rejects unsupported languages', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
    strict_1.default.throws(() => game.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello' }, language: JSON.parse('"fr"') }), /Unsupported language/);
});
(0, node_test_1.default)('switchLanguage rejects answer not in new dictionary', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
    strict_1.default.throws(() => game.switchLanguage({ answer: 'hello', dictionary: { world: 'world' }, language: 'en' }), /not in dictionary/);
});
