"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const game_1 = require("../src/game");
const words_1 = require("../src/words");
const stats_1 = require("../src/stats");
(0, node_test_1.default)('buildShareText renders Termo-style result grid', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['sábio', 'termo'], language: 'pt' });
    for (const ch of 'sabio')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    strict_1.default.equal((0, stats_1.buildShareText)(game.state, 1634, 1), [
        'joguei term.ooo #1634 *2/6 🔥 1',
        '',
        '⬛⬛⬛⬛🟩',
        '🟩🟩🟩🟩🟩',
    ].join('\n'));
});
(0, node_test_1.default)('buildShareText renders Wordle-style result for English', () => {
    const game = (0, game_1.createGame)({ answer: 'crane', dictionary: ['slate', 'crane'], language: 'en' });
    for (const ch of 'slate')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    for (const ch of 'crane')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    strict_1.default.equal((0, stats_1.buildShareText)(game.state, 1800, 3), [
        'Wordle 1800 2/6',
        '',
        '⬛⬛🟩⬛🟩',
        '🟩🟩🟩🟩🟩',
    ].join('\n'));
});
(0, node_test_1.default)('recordDailyResult stores one result per daily puzzle', () => {
    const stats = (0, stats_1.defaultStats)();
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    const first = (0, stats_1.recordDailyResult)(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
    const second = (0, stats_1.recordDailyResult)(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
    strict_1.default.equal(first.recorded, true);
    strict_1.default.equal(second.recorded, false);
    strict_1.default.equal(stats.gamesPlayed, 1);
    strict_1.default.equal(stats.wins, 1);
    strict_1.default.equal(stats.currentStreak, 1);
    strict_1.default.equal(stats.distribution[1], 1);
});
(0, node_test_1.default)('recordDailyResult tracks losses in the skull distribution row', () => {
    const stats = (0, stats_1.defaultStats)();
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['sábio', 'pedra', 'opaco', 'arroz', 'briga', 'tempo', 'termo'], language: 'pt' });
    for (const guess of ['sabio', 'pedra', 'opaco', 'arroz', 'briga', 'tempo']) {
        for (const ch of guess)
            game.addLetter(ch);
        strict_1.default.equal(game.submitGuess(), true);
    }
    strict_1.default.equal(game.state.status, 'lost');
    const result = (0, stats_1.recordDailyResult)(stats, game.state, { id: 'pt:2026-06-25', number: 1633 });
    strict_1.default.equal(result.recorded, true);
    strict_1.default.equal(stats.gamesPlayed, 1);
    strict_1.default.equal(stats.wins, 0);
    strict_1.default.equal(stats.losses, 1);
    strict_1.default.equal(stats.currentStreak, 0);
    strict_1.default.match((0, stats_1.distributionRows)(stats).join('\n'), /☠/);
});
(0, node_test_1.default)('daily countdown uses São Paulo midnight for Portuguese', () => {
    const date = new Date('2026-06-24T21:30:00-03:00');
    strict_1.default.equal((0, words_1.dailyPuzzleNumber)('pt', date), 1632);
    strict_1.default.equal((0, words_1.secondsUntilNextDaily)('pt', date), 9_000);
    strict_1.default.equal((0, words_1.formatNextDailyCountdown)(9_000), '2h 30m');
});
(0, node_test_1.default)('daily countdown uses UTC midnight for English', () => {
    const date = new Date('2026-06-24T21:30:00Z');
    strict_1.default.equal((0, words_1.secondsUntilNextDaily)('en', date), 9_000);
    strict_1.default.equal((0, words_1.dailyDateKey)('en', date), '2026-06-24');
    strict_1.default.ok((0, words_1.dailyPuzzleNumber)('en', date) > 0);
});
(0, node_test_1.default)('dailyDescriptor is language-scoped', () => {
    const date = new Date('2026-06-24T12:00:00Z');
    const en = (0, words_1.dailyDescriptor)('en', date);
    const pt = (0, words_1.dailyDescriptor)('pt', date);
    strict_1.default.equal(en.id, `en:${(0, words_1.dailyDateKey)('en', date)}`);
    strict_1.default.equal(pt.id, `pt:${(0, words_1.dailyDateKey)('pt', date)}`);
    strict_1.default.notEqual(en.id, pt.id);
    strict_1.default.equal(en.number, (0, words_1.dailyPuzzleNumber)('en', date));
    strict_1.default.equal(pt.number, (0, words_1.dailyPuzzleNumber)('pt', date));
});
(0, node_test_1.default)('share text maps tile states to colored squares', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['metro', 'termo'], language: 'pt' });
    for (const ch of 'metro')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    const row = game.state.evaluations[0];
    strict_1.default.deepEqual(row, [game_1.TILE.PRESENT, game_1.TILE.CORRECT, game_1.TILE.PRESENT, game_1.TILE.PRESENT, game_1.TILE.CORRECT]);
    strict_1.default.match((0, stats_1.buildShareText)(game.state, 10, 0), /🟨🟩🟨🟨🟩/);
});
