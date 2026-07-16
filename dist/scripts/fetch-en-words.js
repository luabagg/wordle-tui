"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const WORD_LENGTH = 5;
const TARGET_ANSWER_COUNT = 2500;
function normalize(word) {
    return word
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}
function projectRoot() {
    let dir = __dirname;
    while (!node_fs_1.default.existsSync(node_path_1.default.join(dir, 'package.json'))) {
        const parent = node_path_1.default.dirname(dir);
        if (parent === dir)
            throw new Error('Could not find project root');
        dir = parent;
    }
    return dir;
}
async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.text();
}
async function main() {
    const root = projectRoot();
    const outDir = node_path_1.default.join(root, 'src/dict/en');
    await promises_1.default.mkdir(outDir, { recursive: true });
    const guessText = await fetchText('https://raw.githubusercontent.com/tabatkins/wordle-list/main/words');
    const freqText = await fetchText('https://norvig.com/ngrams/count_1w.txt');
    const guesses = new Set(guessText
        .split(/\r?\n/)
        .map(normalize)
        .filter((w) => w.length === WORD_LENGTH));
    const answers = [];
    for (const line of freqText.split(/\r?\n/)) {
        if (!line.trim())
            continue;
        const [word] = line.split('\t');
        const key = normalize(word);
        if (key.length === WORD_LENGTH && guesses.has(key) && !answers.includes(key)) {
            answers.push(key);
            if (answers.length >= TARGET_ANSWER_COUNT)
                break;
        }
    }
    if (guesses.size === 0)
        throw new Error('No English guesses fetched.');
    if (answers.length === 0)
        throw new Error('No English answers generated.');
    const allSorted = Array.from(guesses).sort();
    const answersSorted = answers.sort();
    await promises_1.default.writeFile(node_path_1.default.join(outDir, 'all.json'), JSON.stringify(allSorted, null, 2) + '\n');
    await promises_1.default.writeFile(node_path_1.default.join(outDir, 'answers.json'), JSON.stringify(answersSorted.map((key) => ({ key, text: key })), null, 2) + '\n');
    console.log(`English: ${allSorted.length} guesses, ${answersSorted.length} answers`);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
