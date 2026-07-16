"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const game_1 = require("../src/game");
const render_1 = require("../src/render");
const input_1 = require("../src/input");
const stats_1 = require("../src/stats");
function stripAnsi(line) {
    return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}
(0, node_test_1.default)('plain q and r are letters during active play', () => {
    strict_1.default.equal((0, input_1.isQuitCommand)({ name: 'q', ctrl: false }, 'playing'), false);
    strict_1.default.equal((0, input_1.isRestartCommand)({ name: 'r', ctrl: false }, 'playing'), false);
    const game = (0, game_1.createGame)({ answer: 'quero', dictionary: ['quero'], language: 'pt' });
    game.addLetter('q');
    game.addLetter('r');
    strict_1.default.equal(game.state.currentGuess, 'qr');
});
(0, node_test_1.default)('finished games accept q to quit and r to restart', () => {
    strict_1.default.equal((0, input_1.isQuitCommand)({ name: 'q', ctrl: false }, 'won'), true);
    strict_1.default.equal((0, input_1.isRestartCommand)({ name: 'r', ctrl: false }, 'lost'), true);
});
(0, node_test_1.default)('ctrl shortcuts open help and progress while plain keys stay available', () => {
    strict_1.default.equal((0, input_1.isHelpCommand)({ name: 'h', ctrl: true }), true);
    strict_1.default.equal((0, input_1.isHelpCommand)({ name: 'h', ctrl: false }), false);
    strict_1.default.equal((0, input_1.isProgressCommand)({ name: 'p', ctrl: true }), true);
    strict_1.default.equal((0, input_1.isProgressCommand)({ name: 'p', ctrl: false }), false);
    strict_1.default.equal((0, input_1.isBackCommand)({ name: 'escape', ctrl: false }), true);
});
(0, node_test_1.default)('share command only works after a round ends', () => {
    strict_1.default.equal((0, input_1.isShareCommand)({ name: 's', ctrl: false }, 'playing'), false);
    strict_1.default.equal((0, input_1.isShareCommand)({ name: 's', ctrl: false }, 'won'), true);
    strict_1.default.equal((0, input_1.isShareCommand)({ name: 's', ctrl: true }, 'won'), false);
});
(0, node_test_1.default)('language switch uses Ctrl+L and leaves plain L free', () => {
    strict_1.default.equal((0, input_1.isLanguageSwitchCommand)({ name: 'l', ctrl: true }), true);
    strict_1.default.equal((0, input_1.isLanguageSwitchCommand)({ name: 'l', ctrl: false }), false);
});
(0, node_test_1.default)('terminal UI uses the alternate screen buffer', () => {
    strict_1.default.match((0, render_1.enterTerminalUi)(), /\x1b\[\?1049h/);
    strict_1.default.match((0, render_1.leaveTerminalUi)(), /\x1b\[\?1049l/);
});
(0, node_test_1.default)('rendered board stays centered at a normal terminal width', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    const lines = (0, render_1.renderGameLines)(game, 80);
    const boardLine = lines.find((line) => /T\s+E\s+R\s+M\s+O/.test(stripAnsi(line)));
    strict_1.default.ok(boardLine);
    strict_1.default.ok(boardLine.match(/^ */)[0].length >= 20);
    strict_1.default.ok(stripAnsi(boardLine).length <= 80);
});
(0, node_test_1.default)('empty tiles render as painted cells without bracket placeholders', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    const text = (0, render_1.renderGameLines)(game, 80).map(stripAnsi).join('\n');
    strict_1.default.doesNotMatch(text, /\[[ A-Z]?\]/);
    strict_1.default.match(text, /·/);
});
(0, node_test_1.default)('keyboard includes a visible feedback legend', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    const text = (0, render_1.renderGameLines)(game, 80).map(stripAnsi).join('\n');
    strict_1.default.match(text, /Legenda/);
    strict_1.default.match(text, /correta/);
    strict_1.default.match(text, /existe/);
    strict_1.default.match(text, /fora/);
});
(0, node_test_1.default)('finished game shows share prompt without result block before sharing', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    const stats = (0, stats_1.defaultStats)();
    (0, stats_1.recordDailyResult)(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
    const text = (0, render_1.renderGameLines)(game, 80, {
        stats,
        puzzleNumber: 1632,
        nextWordIn: '12h 34m',
    }).map(stripAnsi).join('\n');
    strict_1.default.match(text, /Compartilhar: pressione S para copiar/);
    strict_1.default.doesNotMatch(text, /Progresso/);
    strict_1.default.doesNotMatch(text, /joguei term\.ooo #1632 \*1\/6/);
});
(0, node_test_1.default)('finished game shows share block only after share action', () => {
    const game = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    for (const ch of 'termo')
        game.addLetter(ch);
    strict_1.default.equal(game.submitGuess(), true);
    const stats = (0, stats_1.defaultStats)();
    (0, stats_1.recordDailyResult)(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
    const text = (0, render_1.renderGameLines)(game, 80, {
        stats,
        puzzleNumber: 1632,
        nextWordIn: '12h 34m',
        shareCopied: true,
    }).map(stripAnsi).join('\n');
    strict_1.default.match(text, /Resultado copiado/);
    strict_1.default.match(text, /joguei term\.ooo #1632 \*1\/6/);
    strict_1.default.match(text, /🟩🟩🟩🟩🟩/);
});
(0, node_test_1.default)('progress view renders separately with a back hint and skull row', () => {
    const stats = (0, stats_1.defaultStats)();
    stats.gamesPlayed = 3;
    stats.wins = 2;
    stats.losses = 1;
    stats.currentStreak = 0;
    stats.maxStreak = 2;
    stats.distribution[2] = 1;
    stats.distribution[4] = 1;
    const text = (0, render_1.renderProgressLines)(stats, 80, '12h 34m').map(stripAnsi).join('\n');
    strict_1.default.match(text, /Progresso/);
    strict_1.default.match(text, /Próxima palavra em 12h 34m/);
    strict_1.default.match(text, /☠/);
    strict_1.default.match(text, /Voltar: Esc ou Ctrl\+P/);
});
(0, node_test_1.default)('help view can be rendered explicitly', () => {
    const text = (0, render_1.renderHelpLines)(80).map(stripAnsi).join('\n');
    strict_1.default.match(text, /TERMO TUI/);
    strict_1.default.match(text, /Ctrl\+H/);
    strict_1.default.match(text, /Voltar/);
});
(0, node_test_1.default)('rendered game title uses localized strings only', () => {
    const pt = (0, game_1.createGame)({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
    const en = (0, game_1.createGame)({ answer: 'crane', dictionary: ['crane'], language: 'en' });
    const ptText = (0, render_1.renderGameLines)(pt, 80).map(stripAnsi).join('\n');
    const enText = (0, render_1.renderGameLines)(en, 80).map(stripAnsi).join('\n');
    strict_1.default.match(ptText, /TERMO TUI/);
    strict_1.default.doesNotMatch(ptText, /WORDLE TUI/);
    strict_1.default.match(enText, /WORDLE TUI/);
});
