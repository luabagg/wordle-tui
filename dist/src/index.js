#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_readline_1 = __importDefault(require("node:readline"));
const game_1 = require("./game");
const dictionary_1 = require("./dictionary");
const words_1 = require("./words");
const stats_1 = require("./stats");
const render_1 = require("./render");
const tips_1 = require("./tips");
const solver_1 = require("./solver");
const input_1 = require("./input");
function parseLanguage(argv) {
    const flagIndex = argv.findIndex((arg) => arg === '--lang' || arg === '-l');
    if (flagIndex >= 0 && argv[flagIndex + 1]) {
        const value = argv[flagIndex + 1].toLowerCase();
        if (value === 'en' || value === 'pt')
            return value;
    }
    const inline = argv.find((arg) => arg.startsWith('--lang='));
    if (inline) {
        const value = inline.slice('--lang='.length).toLowerCase();
        if (value === 'en' || value === 'pt')
            return value;
    }
    return (0, dictionary_1.defaultLanguage)();
}
function otherLanguage(language) {
    return language === 'en' ? 'pt' : 'en';
}
async function run(argv = process.argv.slice(2)) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        process.stderr.write('This game requires an interactive terminal (TTY).\n');
        process.exit(1);
    }
    let language = parseLanguage(argv);
    const banks = {
        en: (0, dictionary_1.loadWordBank)('en'),
        pt: (0, dictionary_1.loadWordBank)('pt'),
    };
    let bank = banks[language];
    let daily = (0, words_1.dailyDescriptor)(language);
    let todayAnswer = (0, words_1.dailyAnswer)(language, bank.answers);
    const game = (0, game_1.createGame)({
        answer: todayAnswer,
        dictionary: bank.allWords,
        language,
    });
    const stats = (0, stats_1.loadStats)();
    let view = stats.introSeen ? 'game' : 'help';
    let introPending = !stats.introSeen;
    let shareCopied = false;
    function renderOptions() {
        return {
            stats,
            puzzleNumber: daily.number,
            nextWordIn: (0, words_1.formatNextDailyCountdown)((0, words_1.secondsUntilNextDaily)(language)),
            shareCopied,
        };
    }
    function buildTips() {
        const history = game.state.guesses.map((guess, index) => ({
            guess: (0, solver_1.normalizeAll)([guess])[0],
            evals: game.state.evaluations[index],
        }));
        const candidateKeys = bank.answers.map((entry) => entry.key);
        const candidates = (0, solver_1.filterCandidates)(candidateKeys, history);
        const guessPool = candidates.length > 0
            ? candidateKeys
            : Object.keys(bank.allWords);
        const ranked = (0, solver_1.rankGuesses)(guessPool, candidates);
        return (0, tips_1.renderTips)({
            language: game.state.language,
            candidates,
            ranked,
            bestCandidate: (0, solver_1.bestWinProbabilityGuess)(candidates),
            width: process.stdout.columns || 80,
        });
    }
    function draw() {
        const width = process.stdout.columns || 80;
        process.stdout.write(render_1.terminal.clearScreen);
        if (view === 'help') {
            process.stdout.write((0, render_1.renderHelpLines)(width, game.state.language).join('\n'));
        }
        else if (view === 'progress') {
            process.stdout.write((0, render_1.renderProgressLines)(stats, width, (0, words_1.formatNextDailyCountdown)((0, words_1.secondsUntilNextDaily)(language)), game.state.language).join('\n'));
        }
        else if (view === 'tips') {
            process.stdout.write(buildTips().join('\n'));
        }
        else {
            process.stdout.write((0, render_1.renderGameLines)(game, width, renderOptions()).join('\n'));
        }
    }
    function completeIntro() {
        introPending = false;
        stats.introSeen = true;
        (0, stats_1.saveStats)(stats);
    }
    function recordIfFinished() {
        if (game.state.status === 'playing')
            return;
        const result = (0, stats_1.recordDailyResult)(stats, game.state, daily);
        if (result.recorded)
            (0, stats_1.saveStats)(stats);
    }
    function switchLanguage() {
        language = otherLanguage(language);
        bank = banks[language];
        daily = (0, words_1.dailyDescriptor)(language);
        todayAnswer = (0, words_1.dailyAnswer)(language, bank.answers);
        game.switchLanguage({
            answer: todayAnswer,
            dictionary: bank.allWords,
            language,
        });
        shareCopied = false;
        view = 'game';
    }
    function applyAction(action) {
        switch (action.type) {
            case 'quit':
                shutdown(0);
                return;
            case 'restart':
                game.reset(todayAnswer);
                shareCopied = false;
                draw();
                return;
            case 'share':
                process.stdout.write((0, stats_1.osc52CopySequence)((0, stats_1.buildShareText)(game.state, daily.number, stats.currentStreak)));
                shareCopied = true;
                draw();
                return;
            case 'openHelp':
                view = 'help';
                draw();
                return;
            case 'openProgress':
                view = 'progress';
                draw();
                return;
            case 'openTips':
                view = 'tips';
                draw();
                return;
            case 'switchLanguage':
                switchLanguage();
                draw();
                return;
            case 'backToGame':
                view = 'game';
                draw();
                return;
            case 'dismissIntro':
                completeIntro();
                view = 'game';
                draw();
                return;
            case 'submit':
                game.submitGuess();
                shareCopied = false;
                recordIfFinished();
                draw();
                return;
            case 'backspace':
                game.backspace();
                draw();
                return;
            case 'moveCursor':
                game.moveCursor(action.offset);
                draw();
                return;
            case 'setCursor':
                game.setCursorPosition(action.position === 'end' ? game.state.currentGuess.length : action.position);
                draw();
                return;
            case 'type':
                game.addLetter(action.char);
                draw();
                return;
            case 'noop':
            default:
                return;
        }
    }
    node_readline_1.default.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdout.write((0, render_1.enterTerminalUi)());
    function exit() {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write((0, render_1.leaveTerminalUi)());
    }
    function shutdown(exitCode) {
        exit();
        process.exit(exitCode);
    }
    process.on('SIGINT', () => shutdown(0));
    process.on('SIGTERM', () => shutdown(0));
    process.on('uncaughtException', (err) => {
        process.stderr.write(`${String(err)}\n`);
        shutdown(1);
    });
    process.stdin.on('keypress', (str, key) => {
        const action = (0, input_1.resolveKey)({ view, status: game.state.status, introPending }, str, key);
        applyAction(action);
    });
    process.stdout.on('resize', () => draw());
    draw();
}
if (require.main === module) {
    if (process.argv.includes('--mcp')) {
        Promise.resolve().then(() => __importStar(require('./mcp'))).then((mcp) => mcp.main()).catch((error) => {
            process.stderr.write(`${String(error)}\n`);
            process.exit(1);
        });
    }
    else {
        run().catch((error) => {
            process.stderr.write(`${String(error)}\n`);
            process.exit(1);
        });
    }
}
