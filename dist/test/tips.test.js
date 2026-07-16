"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const tips_1 = require("../src/tips");
(0, node_test_1.default)('renderTips includes candidate count and top suggestions', () => {
    const lines = (0, tips_1.renderTips)({
        language: 'en',
        candidates: ['apple', 'apply', 'apron'],
        ranked: [
            { guess: 'apple', entropy: 2.5, topPattern: 'CCCCC', topPatternCount: 1 },
            { guess: 'apply', entropy: 1.5, topPattern: 'CCCCA', topPatternCount: 1 },
        ],
        bestCandidate: 'apple',
        width: 80,
    });
    const text = lines.join('\n');
    strict_1.default.match(text, /3 candidates/);
    strict_1.default.match(text, /APPLE/);
    strict_1.default.match(text, /2\.50 bits/);
});
(0, node_test_1.default)('renderTips handles empty candidates', () => {
    const lines = (0, tips_1.renderTips)({
        language: 'en',
        candidates: [],
        ranked: [],
        bestCandidate: null,
        width: 80,
    });
    const text = lines.join('\n');
    strict_1.default.match(text, /0 candidates/);
});
(0, node_test_1.default)('renderTips is localized for Portuguese', () => {
    const lines = (0, tips_1.renderTips)({
        language: 'pt',
        candidates: ['termo', 'tempo'],
        ranked: [{ guess: 'termo', entropy: 1, topPattern: 'CCCCC', topPatternCount: 1 }],
        bestCandidate: 'termo',
        width: 80,
    });
    const text = lines.join('\n');
    strict_1.default.match(text, /candidatos/);
});
