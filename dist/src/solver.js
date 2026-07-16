"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternKey = patternKey;
exports.normalizeAll = normalizeAll;
exports.filterCandidates = filterCandidates;
exports.entropyOfGuess = entropyOfGuess;
exports.rankGuesses = rankGuesses;
exports.bestWinProbabilityGuess = bestWinProbabilityGuess;
const game_1 = require("./game");
function patternKey(guess, answer) {
    const evals = (0, game_1.evaluateGuess)(guess, answer);
    return evalsToKey(evals);
}
function evalsToKey(evals) {
    return evals.map((e) => {
        if (e === game_1.TILE.CORRECT)
            return 'C';
        if (e === game_1.TILE.PRESENT)
            return 'P';
        return 'A';
    }).join('');
}
function normalizeAll(words) {
    return words.map(game_1.normalizeWord);
}
function filterCandidates(candidates, history) {
    return candidates.filter((candidate) => {
        for (const { guess, evals } of history) {
            if (patternKey(guess, candidate) !== evalsToKey(evals)) {
                return false;
            }
        }
        return true;
    });
}
function bucketsForGuess(guess, candidates) {
    const buckets = new Map();
    for (const answer of candidates) {
        const key = patternKey(guess, answer);
        buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return buckets;
}
function entropyOfGuess(guess, candidates) {
    const buckets = bucketsForGuess(guess, candidates);
    const total = candidates.length;
    if (total === 0)
        return 0;
    let entropy = 0;
    for (const count of buckets.values()) {
        const p = count / total;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}
function rankGuesses(guesses, candidates) {
    const scored = [];
    const total = candidates.length || 1;
    for (const guess of guesses) {
        const buckets = bucketsForGuess(guess, candidates);
        let entropy = 0;
        let topPattern = '';
        let topPatternCount = 0;
        for (const [key, count] of buckets) {
            const p = count / total;
            entropy -= p * Math.log2(p);
            if (count > topPatternCount) {
                topPatternCount = count;
                topPattern = key;
            }
        }
        scored.push({ guess, entropy, topPattern, topPatternCount });
    }
    return scored.sort((a, b) => b.entropy - a.entropy);
}
function bestWinProbabilityGuess(candidates) {
    if (candidates.length === 0)
        return null;
    const ranked = rankGuesses(candidates, candidates);
    return ranked[0]?.guess ?? null;
}
