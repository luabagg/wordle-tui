"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.terminal = exports.colors = void 0;
exports.enterTerminalUi = enterTerminalUi;
exports.leaveTerminalUi = leaveTerminalUi;
exports.bgForTile = bgForTile;
exports.visibleLength = visibleLength;
exports.center = center;
exports.style = style;
exports.renderHelpLines = renderHelpLines;
exports.renderProgressLines = renderProgressLines;
exports.renderGameLines = renderGameLines;
const game_1 = require("./game");
const i18n_1 = require("./i18n");
const stats_1 = require("./stats");
exports.colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    fgInk: '\x1b[38;5;235m',
    fgWhite: '\x1b[97m',
    fgGray: '\x1b[90m',
    fgMuted: '\x1b[38;5;153m',
    fgCyan: '\x1b[38;5;159m',
    fgGreen: '\x1b[38;5;121m',
    fgYellow: '\x1b[38;5;222m',
    fgRed: '\x1b[38;5;203m',
    bgEmpty: '\x1b[48;5;236m',
    bgAbsent: '\x1b[48;5;250m',
    bgPresent: '\x1b[48;5;222m',
    bgCorrect: '\x1b[48;5;121m',
    bgPanelBright: '\x1b[48;5;237m',
};
exports.terminal = {
    enterAltScreen: '\x1b[?1049h',
    leaveAltScreen: '\x1b[?1049l',
    hideCursor: '\x1b[?25l',
    showCursor: '\x1b[?25h',
    clearScreen: '\x1b[2J\x1b[H',
};
const ansiPattern = /\x1b\[[0-9;?]*[A-Za-z]/g;
function enterTerminalUi() {
    return `${exports.terminal.enterAltScreen}${exports.terminal.hideCursor}${exports.terminal.clearScreen}`;
}
function leaveTerminalUi() {
    return `${exports.terminal.showCursor}${exports.colors.reset}${exports.terminal.leaveAltScreen}`;
}
function bgForTile(tile) {
    if (tile === game_1.TILE.CORRECT)
        return exports.colors.bgCorrect;
    if (tile === game_1.TILE.PRESENT)
        return exports.colors.bgPresent;
    if (tile === game_1.TILE.ABSENT)
        return exports.colors.bgAbsent;
    return '';
}
function visibleLength(line) {
    return line.replace(ansiPattern, '').length;
}
function center(line, width) {
    const length = visibleLength(line);
    if (length >= width)
        return line;
    const pad = Math.floor((width - length) / 2);
    return `${' '.repeat(pad)}${line}`;
}
function style(text, ...codes) {
    return `${codes.join('')}${text}${exports.colors.reset}`;
}
function wrapText(text, width) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= width) {
            line = next;
        }
        else {
            if (line)
                lines.push(line);
            line = word;
        }
    }
    if (line)
        lines.push(line);
    return lines.length > 0 ? lines : [''];
}
function pushCenteredWrapped(lines, text, width, ...codes) {
    const wrapWidth = Math.max(28, Math.min(width - 4, 72));
    for (const line of wrapText(text, wrapWidth)) {
        lines.push(center(style(line, ...codes), width));
    }
}
function statusColor(status) {
    if (status === 'won')
        return exports.colors.fgGreen;
    if (status === 'lost')
        return exports.colors.fgRed;
    return exports.colors.fgYellow;
}
const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function tile(letter, state, active = false) {
    const ch = letter ? letter.toUpperCase() : ' ';
    if (active) {
        const text = ch === ' ' ? '·' : ch;
        return style(`  ${text}  `, exports.colors.bgPanelBright, exports.colors.fgWhite, exports.colors.bold);
    }
    if (state === game_1.TILE.EMPTY) {
        const text = ch === ' ' ? '·' : ch;
        return style(`  ${text}  `, exports.colors.bgEmpty, exports.colors.fgMuted, exports.colors.bold);
    }
    if (state === game_1.TILE.PRESENT) {
        return style(`  ${ch}  `, exports.colors.bgPresent, exports.colors.fgInk, exports.colors.bold);
    }
    if (state === game_1.TILE.ABSENT) {
        return style(`  ${ch}  `, exports.colors.bgAbsent, exports.colors.fgInk, exports.colors.bold);
    }
    return style(`  ${ch}  `, bgForTile(state), exports.colors.fgInk, exports.colors.bold);
}
function keyChip(letter, state) {
    const ch = letter.toUpperCase();
    if (state === game_1.TILE.CORRECT)
        return style(` ${ch} `, exports.colors.bgCorrect, exports.colors.fgInk, exports.colors.bold);
    if (state === game_1.TILE.PRESENT)
        return style(` ${ch} `, exports.colors.bgPresent, exports.colors.fgInk, exports.colors.bold);
    if (state === game_1.TILE.ABSENT)
        return style(` ${ch} `, exports.colors.bgAbsent, exports.colors.fgInk, exports.colors.bold);
    return style(` ${ch} `, exports.colors.bgPanelBright, exports.colors.fgMuted, exports.colors.bold);
}
function legendChip(text, state, language) {
    const label = state === game_1.TILE.CORRECT
        ? i18n_1.messages[language].helpLegendCorrect
        : state === game_1.TILE.PRESENT
            ? i18n_1.messages[language].helpLegendPresent
            : i18n_1.messages[language].helpLegendAbsent;
    return `${tile(text, state)} ${label}`;
}
function pushKeyboardLegend(lines, width, language) {
    lines.push(center(style(i18n_1.messages[language].helpLegendTitle, exports.colors.fgMuted, exports.colors.bold), width));
    lines.push(center(`${legendChip('C', game_1.TILE.CORRECT, language)}  ${legendChip('E', game_1.TILE.PRESENT, language)}  ${legendChip('F', game_1.TILE.ABSENT, language)}`, width));
}
function renderHelpLines(width, language = 'pt') {
    const safeWidth = Math.max(34, width || 80);
    const strings = i18n_1.messages[language];
    const lines = [];
    lines.push('');
    lines.push(center(style(strings.helpTitle, exports.colors.bgPanelBright, exports.colors.fgCyan, exports.colors.bold), safeWidth));
    lines.push('');
    pushCenteredWrapped(lines, strings.helpIntro, safeWidth, exports.colors.fgWhite, exports.colors.bold);
    pushCenteredWrapped(lines, strings.helpInstructions, safeWidth, exports.colors.fgMuted);
    lines.push('');
    pushKeyboardLegend(lines, safeWidth, language);
    lines.push('');
    pushCenteredWrapped(lines, strings.helpAutosave, safeWidth, exports.colors.fgGray);
    pushCenteredWrapped(lines, strings.helpShortcuts, safeWidth, exports.colors.fgGray);
    lines.push('');
    lines.push(center(style(strings.helpBack, exports.colors.fgGreen, exports.colors.bold), safeWidth));
    lines.push('');
    return lines;
}
function renderProgressLines(stats, width, nextWordIn, language = 'pt') {
    const safeWidth = Math.max(34, width || 80);
    const strings = i18n_1.messages[language];
    const lines = [];
    lines.push('');
    lines.push(center(style(strings.progressTitle, exports.colors.fgCyan, exports.colors.bold), safeWidth));
    lines.push(center(style(strings.progressStats({
        gamesPlayed: stats.gamesPlayed,
        winRate: (0, stats_1.winRate)(stats),
        currentStreak: stats.currentStreak,
        maxStreak: stats.maxStreak,
    }), exports.colors.fgMuted), safeWidth));
    lines.push('');
    for (const row of (0, stats_1.distributionRows)(stats)) {
        lines.push(center(style(row, exports.colors.fgGray), safeWidth));
    }
    lines.push('');
    lines.push(center(style(strings.progressNextWord(nextWordIn), exports.colors.fgYellow, exports.colors.bold), safeWidth));
    lines.push('');
    lines.push(center(style(strings.progressBack, exports.colors.fgGreen, exports.colors.bold), safeWidth));
    lines.push('');
    return lines;
}
function pushShare(lines, game, width, options, language) {
    if (game.state.status === 'playing' || !options.stats || !options.puzzleNumber)
        return;
    const strings = i18n_1.messages[language];
    lines.push('');
    if (!options.shareCopied) {
        lines.push(center(style(strings.sharePrompt, exports.colors.fgGreen, exports.colors.bold), width));
        return;
    }
    lines.push(center(style(strings.shareCopied, exports.colors.fgGreen, exports.colors.bold), width));
    for (const line of (0, stats_1.buildShareText)(game.state, options.puzzleNumber, options.stats.currentStreak).split('\n')) {
        lines.push(center(style(line || ' ', exports.colors.fgWhite), width));
    }
}
function renderGameLines(game, width, options = {}) {
    if (options.showIntro)
        return renderHelpLines(width, game.state.language);
    const strings = i18n_1.messages[game.state.language];
    const guessesLeft = game_1.MAX_GUESSES - game.state.guesses.length;
    const controls = game.state.status === 'playing' ? strings.controlsPlaying : strings.controlsFinished;
    const lines = [];
    const safeWidth = Math.max(34, width || 80);
    lines.push('');
    lines.push(center(style(` ${strings.title} `, exports.colors.bgPanelBright, exports.colors.fgCyan, exports.colors.bold), safeWidth));
    pushCenteredWrapped(lines, strings.subtitle, safeWidth, exports.colors.fgMuted);
    lines.push(center(style(strings.guessesUsed(game.state.guesses.length, guessesLeft), exports.colors.fgGray), safeWidth));
    pushCenteredWrapped(lines, controls, safeWidth, exports.colors.fgGray);
    if (strings.accentHint)
        pushCenteredWrapped(lines, strings.accentHint, safeWidth, exports.colors.fgMuted);
    lines.push('');
    for (let r = 0; r < game_1.MAX_GUESSES; r += 1) {
        let row = '';
        if (r < game.state.guesses.length) {
            const guess = Array.from(game.state.guesses[r]);
            const evals = game.state.evaluations[r];
            for (let c = 0; c < game_1.WORD_LENGTH; c += 1)
                row += `${tile(guess[c], evals[c])} `;
        }
        else if (r === game.state.guesses.length) {
            const currentGuess = Array.from(game.state.currentGuess);
            const activeIndex = Math.min(game.state.cursorPosition, game_1.WORD_LENGTH - 1);
            for (let c = 0; c < game_1.WORD_LENGTH; c += 1)
                row += `${tile(currentGuess[c], game_1.TILE.EMPTY, c === activeIndex)} `;
        }
        else {
            for (let c = 0; c < game_1.WORD_LENGTH; c += 1)
                row += `${tile('', game_1.TILE.EMPTY)} `;
        }
        lines.push(center(row.trimEnd(), safeWidth));
    }
    lines.push('');
    for (const row of keyRows) {
        const keys = row.split('').map((k) => {
            const state = game.state.keyState.get(k) || game_1.TILE.EMPTY;
            return keyChip(k, state);
        }).join(' ');
        lines.push(center(keys, safeWidth));
    }
    lines.push('');
    pushKeyboardLegend(lines, safeWidth, game.state.language);
    lines.push('');
    pushCenteredWrapped(lines, game.state.message || ' ', safeWidth, statusColor(game.state.status), exports.colors.bold);
    pushShare(lines, game, safeWidth, options, game.state.language);
    lines.push('');
    return lines;
}
