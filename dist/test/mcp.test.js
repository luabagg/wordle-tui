"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const mcp_1 = require("../src/mcp");
const game_1 = require("../src/game");
(0, node_test_1.default)('buildGameStateResponse returns serializable state', () => {
    const game = (0, game_1.createGame)({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
    const state = (0, mcp_1.buildGameStateResponse)(game);
    strict_1.default.equal(state.status, 'playing');
    strict_1.default.equal(state.grid.length, 6);
    strict_1.default.equal(state.language, 'en');
    strict_1.default.ok(Array.isArray(state.keyboard));
});
(0, node_test_1.default)('createSession starts an English game', async () => {
    const session = await (0, mcp_1.createSession)('en');
    strict_1.default.equal(session.game.state.language, 'en');
    strict_1.default.equal(session.game.state.status, 'playing');
    strict_1.default.ok(session.enBank.language === 'en');
    strict_1.default.ok(session.ptBank.language === 'pt');
});
(0, node_test_1.default)('createSession starts a Portuguese game', async () => {
    const session = await (0, mcp_1.createSession)('pt');
    strict_1.default.equal(session.game.state.language, 'pt');
});
