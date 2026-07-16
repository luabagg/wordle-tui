"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWordBank = loadWordBank;
exports.defaultLanguage = defaultLanguage;
const all_json_1 = __importDefault(require("./dict/pt/all.json"));
const answers_json_1 = __importDefault(require("./dict/pt/answers.json"));
const all_json_2 = __importDefault(require("./dict/en/all.json"));
const answers_json_2 = __importDefault(require("./dict/en/answers.json"));
function toWordMap(words) {
    const map = {};
    for (const word of words) {
        map[word] = word;
    }
    return map;
}
const ptBank = {
    language: 'pt',
    allWords: all_json_1.default,
    answers: answers_json_1.default,
};
const enBank = {
    language: 'en',
    allWords: toWordMap(all_json_2.default),
    answers: answers_json_2.default,
};
function loadWordBank(language = 'pt') {
    if (language === 'pt')
        return ptBank;
    if (language === 'en')
        return enBank;
    throw new Error(`Unsupported language: ${language}`);
}
function defaultLanguage() {
    return 'pt';
}
