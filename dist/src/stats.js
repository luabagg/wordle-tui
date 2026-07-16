"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultStats = defaultStats;
exports.statsFilePath = statsFilePath;
exports.loadStats = loadStats;
exports.saveStats = saveStats;
exports.buildShareText = buildShareText;
exports.recordDailyResult = recordDailyResult;
exports.winRate = winRate;
exports.distributionRows = distributionRows;
exports.osc52CopySequence = osc52CopySequence;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const game_1 = require("./game");
function defaultStats() {
    return {
        introSeen: false,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        currentStreak: 0,
        maxStreak: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        results: {},
    };
}
function normalizeStats(value) {
    const fallback = defaultStats();
    if (!value || typeof value !== 'object')
        return fallback;
    const raw = value;
    const distribution = raw.distribution || fallback.distribution;
    return {
        introSeen: Boolean(raw.introSeen),
        gamesPlayed: Number(raw.gamesPlayed || 0),
        wins: Number(raw.wins || 0),
        losses: Number(raw.losses ?? Math.max(0, Number(raw.gamesPlayed || 0) - Number(raw.wins || 0))),
        currentStreak: Number(raw.currentStreak || 0),
        maxStreak: Number(raw.maxStreak || 0),
        distribution: {
            1: Number(distribution[1] || 0),
            2: Number(distribution[2] || 0),
            3: Number(distribution[3] || 0),
            4: Number(distribution[4] || 0),
            5: Number(distribution[5] || 0),
            6: Number(distribution[6] || 0),
        },
        results: raw.results && typeof raw.results === 'object' ? raw.results : {},
    };
}
function statsFilePath(env = process.env, home = node_os_1.default.homedir()) {
    const stateHome = env.XDG_STATE_HOME || node_path_1.default.join(home, '.local', 'state');
    return node_path_1.default.join(stateHome, 'wordle-tui', 'stats.json');
}
function loadStats(filePath = statsFilePath()) {
    try {
        return normalizeStats(JSON.parse(node_fs_1.default.readFileSync(filePath, 'utf8')));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return defaultStats();
        throw error;
    }
}
function saveStats(stats, filePath = statsFilePath()) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(filePath), { recursive: true });
    node_fs_1.default.writeFileSync(filePath, `${JSON.stringify(stats, null, 2)}\n`);
}
function tileEmoji(tile) {
    if (tile === game_1.TILE.CORRECT)
        return '🟩';
    if (tile === game_1.TILE.PRESENT)
        return '🟨';
    return '⬛';
}
function buildShareText(state, puzzleNumber, streak) {
    const result = state.status === 'won' ? state.guesses.length.toString() : 'X';
    const rows = state.evaluations.map((evals) => evals.map(tileEmoji).join(''));
    const headline = state.language === 'en'
        ? `Wordle ${puzzleNumber} ${result}/${game_1.MAX_GUESSES}`
        : `joguei term.ooo #${puzzleNumber} *${result}/${game_1.MAX_GUESSES} 🔥 ${streak}`;
    return [headline, '', ...rows].join('\n');
}
function recordDailyResult(stats, state, daily, completedAt = new Date()) {
    if (state.status === 'playing')
        return { recorded: false };
    if (stats.results[daily.id])
        return { recorded: false, result: stats.results[daily.id] };
    const won = state.status === 'won';
    const guesses = state.guesses.length;
    stats.gamesPlayed += 1;
    if (won) {
        stats.wins += 1;
        stats.currentStreak += 1;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        stats.distribution[guesses] += 1;
    }
    else {
        stats.losses += 1;
        stats.currentStreak = 0;
    }
    const result = {
        puzzle: daily.number,
        won,
        guesses,
        completedAt: completedAt.toISOString(),
        shareText: buildShareText(state, daily.number, stats.currentStreak),
    };
    stats.results[daily.id] = result;
    return { recorded: true, result };
}
function winRate(stats) {
    if (stats.gamesPlayed === 0)
        return 0;
    return Math.round((stats.wins / stats.gamesPlayed) * 100);
}
function distributionRows(stats) {
    const counts = [1, 2, 3, 4, 5, 6].map((guess) => stats.distribution[guess]);
    const losses = stats.losses ?? Math.max(0, stats.gamesPlayed - stats.wins);
    const max = Math.max(1, ...counts);
    const rows = counts.map((count, index) => {
        const bar = count === 0 ? '·' : '█'.repeat(Math.max(1, Math.round((count / max) * 12)));
        return `${index + 1} ${bar} ${count}`;
    });
    const lossBar = losses === 0 ? '·' : '█'.repeat(Math.max(1, Math.round((losses / Math.max(max, losses)) * 12)));
    rows.push(`☠ ${lossBar} ${losses}`);
    return rows;
}
function osc52CopySequence(text) {
    return `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
}
