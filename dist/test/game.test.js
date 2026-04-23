"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const game_1 = require("../src/game");
(0, node_test_1.default)('evaluateGuess marks repeated letters correctly', () => {
    const result = (0, game_1.evaluateGuess)('eerie', 'sweep');
    strict_1.default.deepEqual(result, [game_1.TILE.PRESENT, game_1.TILE.PRESENT, game_1.TILE.ABSENT, game_1.TILE.ABSENT, game_1.TILE.ABSENT]);
});
(0, node_test_1.default)('game wins on correct guess', () => {
    const game = (0, game_1.createGame)('crane', ['crane', 'adieu']);
    for (const ch of 'crane')
        game.addLetter(ch);
    const submitted = game.submitGuess();
    strict_1.default.equal(submitted, true);
    strict_1.default.equal(game.state.status, 'won');
});
(0, node_test_1.default)('invalid word is rejected', () => {
    const game = (0, game_1.createGame)('crane', ['crane', 'adieu']);
    for (const ch of 'xxxxx')
        game.addLetter(ch);
    const submitted = game.submitGuess();
    strict_1.default.equal(submitted, false);
    strict_1.default.equal(game.state.message, 'Word not in list.');
});
