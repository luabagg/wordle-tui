"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const solver_1 = require("../src/solver");
const game_1 = require("../src/game");
(0, node_test_1.default)('patternKey groups feedback by letter state', () => {
    strict_1.default.equal((0, solver_1.patternKey)('salty', 'salty'), 'CCCCC');
    strict_1.default.equal((0, solver_1.patternKey)('sabio', 'termo'), 'AAAAC');
});
(0, node_test_1.default)('filterCandidates narrows to words matching all evaluations', () => {
    const candidates = ['saint', 'sails', 'sabot', 'salty'];
    const result = (0, solver_1.filterCandidates)(candidates, [
        { guess: 'salty', evals: [game_1.TILE.CORRECT, game_1.TILE.CORRECT, game_1.TILE.ABSENT, game_1.TILE.PRESENT, game_1.TILE.ABSENT] },
    ]);
    strict_1.default.deepEqual(result, ['saint', 'sabot']);
});
(0, node_test_1.default)('filterCandidates respects absent letters', () => {
    const candidates = ['apple', 'apply', 'apron'];
    const result = (0, solver_1.filterCandidates)(candidates, [
        { guess: 'apple', evals: [game_1.TILE.CORRECT, game_1.TILE.CORRECT, game_1.TILE.CORRECT, game_1.TILE.CORRECT, game_1.TILE.ABSENT] },
    ]);
    strict_1.default.deepEqual(result, ['apply']);
});
(0, node_test_1.default)('entropyOfGuess computes non-negative expected bits', () => {
    const candidates = ['aback', 'abbey', 'abbot', 'about'];
    const info = (0, solver_1.entropyOfGuess)('aahed', candidates);
    strict_1.default.ok(typeof info === 'number');
    strict_1.default.ok(info >= 0);
});
(0, node_test_1.default)('rankGuesses returns entropy-sorted suggestions', () => {
    const candidates = ['aback', 'abbey', 'abbot'];
    const ranked = (0, solver_1.rankGuesses)(candidates, candidates);
    strict_1.default.ok(ranked.length > 0);
    strict_1.default.ok(ranked[0].entropy >= ranked[ranked.length - 1].entropy);
});
(0, node_test_1.default)('bestWinProbabilityGuess returns a valid candidate', () => {
    const candidates = ['apple', 'apply', 'apron'];
    const best = (0, solver_1.bestWinProbabilityGuess)(candidates);
    strict_1.default.ok(best);
    strict_1.default.ok(candidates.includes(best));
});
(0, node_test_1.default)('normalizeAll removes accents and lowercases', () => {
    strict_1.default.deepEqual((0, solver_1.normalizeAll)(['SÁBIO', 'TéRmO']), ['sabio', 'termo']);
});
