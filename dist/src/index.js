#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_readline_1 = __importDefault(require("node:readline"));
const game_1 = require("./game");
const words_1 = require("./words");
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    fgWhite: '\x1b[97m',
    fgGray: '\x1b[90m',
    bgAbsent: '\x1b[48;5;240m',
    bgPresent: '\x1b[48;5;178m',
    bgCorrect: '\x1b[48;5;34m',
    bgPanel: '\x1b[48;5;236m',
};
const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function bgForTile(tile) {
    if (tile === game_1.TILE.CORRECT)
        return colors.bgCorrect;
    if (tile === game_1.TILE.PRESENT)
        return colors.bgPresent;
    if (tile === game_1.TILE.ABSENT)
        return colors.bgAbsent;
    return '';
}
function center(line, width) {
    if (line.length >= width)
        return line;
    const pad = Math.floor((width - line.length) / 2);
    return `${' '.repeat(pad)}${line}`;
}
function tile(letter, state) {
    const ch = letter ? letter.toUpperCase() : ' ';
    const bg = bgForTile(state);
    const text = state === game_1.TILE.EMPTY ? `${colors.fgGray}${ch}${colors.reset}` : `${colors.fgWhite}${colors.bold}${ch}${colors.reset}`;
    if (state === game_1.TILE.EMPTY)
        return `[${text}]`;
    return `${bg} ${text} ${colors.reset}`;
}
function draw(game) {
    const width = process.stdout.columns || 80;
    const lines = [];
    lines.push('');
    lines.push(center(`${colors.bold}WORDLE TUI SUPER MODE${colors.reset}`, width));
    lines.push(center(`${colors.fgGray}Local dictionary • Enter submit • Backspace delete • q quit • r restart${colors.reset}`, width));
    lines.push('');
    for (let r = 0; r < game_1.MAX_GUESSES; r += 1) {
        let row = '';
        if (r < game.state.guesses.length) {
            const guess = game.state.guesses[r];
            const evals = game.state.evaluations[r];
            for (let c = 0; c < game_1.WORD_LENGTH; c += 1)
                row += `${tile(guess[c], evals[c])} `;
        }
        else if (r === game.state.guesses.length) {
            for (let c = 0; c < game_1.WORD_LENGTH; c += 1)
                row += `${tile(game.state.currentGuess[c], game_1.TILE.EMPTY)} `;
        }
        else {
            for (let c = 0; c < game_1.WORD_LENGTH; c += 1)
                row += `${tile('', game_1.TILE.EMPTY)} `;
        }
        lines.push(center(row.trimEnd(), width));
    }
    lines.push('');
    for (const row of keyRows) {
        const keys = row.split('').map((k) => {
            const state = game.state.keyState.get(k) || game_1.TILE.EMPTY;
            const bg = bgForTile(state);
            if (state === game_1.TILE.EMPTY)
                return `${colors.bgPanel} ${k.toUpperCase()} ${colors.reset}`;
            return `${bg}${colors.fgWhite}${colors.bold} ${k.toUpperCase()} ${colors.reset}`;
        }).join(' ');
        lines.push(center(keys, width));
    }
    lines.push('');
    lines.push(center(game.state.message || ' ', width));
    lines.push('');
    process.stdout.write('\x1b[2J\x1b[0f');
    process.stdout.write(lines.join('\n'));
}
async function run() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        process.stderr.write('This game requires an interactive terminal (TTY).\n');
        process.exit(1);
    }
    const bank = (0, words_1.loadWordBank)();
    const game = (0, game_1.createGame)((0, words_1.randomAnswer)(bank.answers), bank.validWords);
    game.state.message = 'Using local dictionary.';
    node_readline_1.default.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    function exit() {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write(`\n${colors.reset}`);
    }
    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            exit();
            process.exit(0);
        }
        if (key.name === 'q') {
            exit();
            process.exit(0);
        }
        if (key.name === 'r') {
            game.reset((0, words_1.randomAnswer)(bank.answers));
            draw(game);
            return;
        }
        if (key.name === 'return') {
            game.submitGuess();
            draw(game);
            return;
        }
        if (key.name === 'backspace') {
            game.backspace();
            draw(game);
            return;
        }
        if (/^[a-z]$/i.test(str || '')) {
            game.addLetter(str.toLowerCase());
            draw(game);
        }
    });
    process.stdout.on('resize', () => draw(game));
    draw(game);
}
if (require.main === module) {
    run().catch((error) => {
        process.stderr.write(`${String(error)}\n`);
        process.exit(1);
    });
}
