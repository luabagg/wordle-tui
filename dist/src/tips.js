"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTips = renderTips;
const i18n_1 = require("./i18n");
const ansiPattern = /\x1b\[[0-9;?]*[A-Za-z]/g;
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    fgCyan: '\x1b[38;5;159m',
    fgWhite: '\x1b[97m',
    fgGray: '\x1b[90m',
    fgGreen: '\x1b[38;5;121m',
    fgYellow: '\x1b[38;5;222m',
    bgPanelBright: '\x1b[48;5;237m',
};
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
    return `${codes.join('')}${text}${colors.reset}`;
}
function formatEntropy(value) {
    return value.toFixed(2);
}
function renderTips(options) {
    const { language, candidates, ranked, bestCandidate, width } = options;
    const strings = i18n_1.messages[language];
    const safeWidth = Math.max(34, width || 80);
    const lines = [];
    lines.push('');
    lines.push(center(style(strings.tipsTitle, colors.bgPanelBright, colors.fgCyan, colors.bold), safeWidth));
    lines.push('');
    lines.push(center(style(strings.tipsCandidateCount(candidates.length), colors.fgWhite, colors.bold), safeWidth));
    if (bestCandidate) {
        lines.push(center(style(strings.tipsBestCandidate(bestCandidate), colors.fgGreen, colors.bold), safeWidth));
    }
    lines.push('');
    lines.push(center(style(strings.tipsTopGuesses, colors.fgGray, colors.bold), safeWidth));
    const top = ranked.slice(0, 8);
    if (top.length === 0) {
        lines.push(center(style(strings.tipsNoSuggestions, colors.fgGray), safeWidth));
    }
    else {
        for (const score of top) {
            const row = `${score.guess.toUpperCase().padEnd(5)} ${formatEntropy(score.entropy).padStart(6)} bits  ${score.topPattern}`;
            lines.push(center(style(row, colors.fgWhite), safeWidth));
        }
    }
    lines.push('');
    lines.push(center(style(strings.tipsBack, colors.fgYellow, colors.bold), safeWidth));
    lines.push('');
    return lines;
}
