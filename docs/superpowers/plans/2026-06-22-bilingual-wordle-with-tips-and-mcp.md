# Bilingual Wordle + Termo with Tips and MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing Termo TUI into a bilingual Wordle/Termo engine with English + Brazilian Portuguese support, an information-theory tips tab, and an MCP server so agents can play via tools.

**Architecture:** Split the monolithic Portuguese TUI into language-agnostic core (`game.ts`), dictionary subsystem (`src/dict/` + `dictionary.ts`), i18n strings (`i18n.ts`), solver (`solver.ts`), TUI views (`index.ts`, `tips.ts`), and an optional MCP server (`mcp.ts`). The game engine accepts a configuration object so language and dictionaries can be swapped mid-session.

**Tech Stack:** TypeScript, Node built-ins (`node:test`, `node:readline`), `@modelcontextprotocol/sdk` for MCP.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/game.ts` | Core word-guessing engine, evaluation, keyboard state. Language-agnostic after refactor. |
| `src/i18n.ts` | Localized messages and labels for `en` and `pt`. |
| `src/dictionary.ts` | Loads dictionaries, defines `Language`, `WordBank`, switches language at runtime. |
| `src/dict/en/all.json` | All valid English 5-letter guesses. |
| `src/dict/en/answers.json` | Curated common English answer words. |
| `src/dict/pt/all.json` | All valid Portuguese 5-letter guesses (from existing `word-data.ts`). |
| `src/dict/pt/answers.json` | Curated Portuguese answer words (from existing `ANSWER_WORDS`). |
| `src/words.ts` | Daily answer selection per language; kept thin. |
| `src/solver.ts` | Constraint filtering, entropy calculator, best-guess selectors. |
| `src/tips.ts` | Renders the tips tab in the TUI. |
| `src/mcp.ts` | MCP server exposing game tools. |
| `src/index.ts` | TUI main loop, view switching, language toggle. |
| `test/game.test.ts` | Core engine tests. |
| `test/dictionary.test.ts` | Dictionary loading / switching tests. |
| `test/solver.test.ts` | Solver / entropy tests. |
| `test/mcp.test.ts` | MCP tool tests. |
| `scripts/fetch-en-words.ts` | One-off script to download and normalize English word lists. |

---

## Phase 1: Harden and language-agnosticize the game engine

### Task 1.1: Define shared types and i18n messages

**Files:**
- Create: `src/i18n.ts`
- Modify: `src/game.ts` (remove hardcoded Portuguese strings)

- [ ] **Step 1: Write the failing test**

Create `test/i18n.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { messages } from '../src/i18n';

test('messages exist for en and pt', () => {
  assert.equal(messages.en.notInDictionary, 'Not in dictionary.');
  assert.equal(messages.pt.notInDictionary, 'Não conheço essa palavra.');
});
```

Run: `npm run build && node --test dist/test/i18n.test.js`
Expected: FAIL, module not found.

- [ ] **Step 2: Create `src/i18n.ts`**

```ts
export type Language = 'en' | 'pt';

export interface GameStrings {
  title: string;
  subtitle: string;
  controlsPlaying: string;
  controlsFinished: string;
  accentHint: string;
  guessesUsed: (used: number, remaining: number) => string;
  notInDictionary: string;
  wrongLength: string;
  winMessage: (guesses: number) => string;
  loseMessage: (answer: string) => string;
  guessRegistered: (guess: number) => string;
  dailyLoaded: (count: number) => string;
  gameReset: string;
}

export const messages: Record<Language, GameStrings> = {
  en: {
    title: 'WORDLE TUI',
    subtitle: 'Guess the 5-letter word in 6 tries.',
    controlsPlaying: 'Type letters. Enter submits. Backspace deletes. Esc quits. Ctrl+R restarts. L changes language. Tab shows tips.',
    controlsFinished: 'Round over. R restarts, Q quits, L changes language.',
    accentHint: '',
    guessesUsed: (used, remaining) => `${used} guess${used === 1 ? '' : 'es'} used • ${remaining} remaining`,
    notInDictionary: 'Not in dictionary.',
    wrongLength: 'Words must be 5 letters.',
    winMessage: (guesses) => `Solved in ${guesses}/6! R restarts, Q quits.`,
    loseMessage: (answer) => `The word was ${answer.toUpperCase()}. R restarts, Q quits.`,
    guessRegistered: (guess) => `Guess ${guess}/6 registered.`,
    dailyLoaded: (count) => `Daily word loaded. ${count.toLocaleString('en-US')} valid guesses.`,
    gameReset: 'Game restarted. Guess the daily word.',
  },
  pt: {
    title: 'TERMO TUI',
    subtitle: 'Descubra a palavra certa em 6 tentativas.',
    controlsPlaying: 'Digite letras. Enter envia. Backspace apaga. Esc sai. Ctrl+R reinicia. L muda idioma. Tab mostra dicas.',
    controlsFinished: 'Fim da rodada. R reinicia a palavra de hoje, Q sai, L muda idioma.',
    accentHint: 'Acentos aparecem automaticamente e não contam nas dicas.',
    guessesUsed: (used, remaining) => `${used} tentativa${used === 1 ? '' : 's'} usadas • ${remaining} tentativa${remaining === 1 ? '' : 's'} restantes`,
    notInDictionary: 'Não conheço essa palavra.',
    wrongLength: 'Só valem palavras com 5 letras.',
    winMessage: (guesses) => `Você descobriu em ${guesses}/6! R reinicia, Q sai.`,
    loseMessage: (answer) => `A palavra era ${answer.toUpperCase()}. R reinicia, Q sai.`,
    guessRegistered: (guess) => `Tentativa ${guess}/6 registrada.`,
    dailyLoaded: (count) => `Palavra diária carregada. ${count.toLocaleString('pt-BR')} palavras aceitas.`,
    gameReset: 'Jogo reiniciado. Descubra a palavra de hoje.',
  },
};
```

- [ ] **Step 3: Run test**

Run: `npm run build && node --test dist/test/i18n.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/i18n.ts test/i18n.test.ts
git commit -m "feat(i18n): add en/pt message bundles"
```

---

### Task 1.2: Refactor `createGame` to accept a config object

**Files:**
- Modify: `src/game.ts`
- Modify: `test/game.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/game.test.ts`, replace old `createGame('termo', [...])` calls with the new config form. Add a new test:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, evaluateGuess, normalizeWord, TILE } from '../src/game';
import { messages } from '../src/i18n';

test('createGame accepts language config and uses localized messages', () => {
  const game = createGame({
    answer: { key: 'termo', text: 'termo' },
    dictionary: { termo: 'termo', sabio: 'sábio' },
    language: 'pt',
  });
  assert.equal(game.state.language, 'pt');
  assert.equal(game.state.message, messages.pt.dailyLoaded(2));
});
```

Run: `npm run build && node --test dist/test/game.test.js`
Expected: FAIL, config signature not supported.

- [ ] **Step 2: Update `src/game.ts` types and factory**

Keep existing exports, but add:

```ts
import { GameStrings, Language, messages } from './i18n';

export interface GameConfig {
  answer: string | WordEntry;
  dictionary: WordDictionary;
  language: Language;
}

export interface GameState {
  answer: string;
  answerKey: string;
  guesses: string[];
  evaluations: TileState[][];
  currentGuess: string;
  status: GameStatus;
  message: string;
  keyState: Map<string, TileState>;
  language: Language;
}
```

Change `createGame(answer: string | WordEntry, dictionary: WordDictionary)` to:

```ts
export function createGame(config: GameConfig) {
  const { answer, dictionary, language } = config;
  const strings = messages[language];
  const words = createWordLookup(dictionary);
  const answerEntry = toAnswerEntry(answer);
  const state: GameState = {
    answer: answerEntry.text,
    answerKey: answerEntry.key,
    guesses: [],
    evaluations: [],
    currentGuess: '',
    status: 'playing',
    message: strings.dailyLoaded(words.has(answerEntry.key) ? 1 : 0),
    keyState: new Map(),
    language,
  };
  // ... rest identical, using strings for messages
}
```

Update all message assignments inside `submitGuess`, `reset`, etc. to use `strings`.

- [ ] **Step 3: Update all existing tests**

Replace every `createGame('termo', ['termo', 'sábio'])` with:

```ts
createGame({ answer: 'termo', dictionary: ['termo', 'sábio'], language: 'pt' })
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts test/game.test.ts
git commit -m "refactor(game): accept language config and use i18n strings"
```

---

### Task 1.3: Add runtime language switch to the game object

**Files:**
- Modify: `src/game.ts`
- Modify: `test/game.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('game can switch language and restart with a new answer', () => {
  const game = createGame({ answer: 'termo', dictionary: { termo: 'termo' }, language: 'pt' });
  game.switchLanguage({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
  assert.equal(game.state.language, 'en');
  assert.equal(game.state.answerKey, 'hello');
  assert.equal(game.state.status, 'playing');
});
```

Run: `npm run build && node --test dist/test/game.test.js`
Expected: FAIL, `switchLanguage` missing.

- [ ] **Step 2: Implement `switchLanguage`**

Add to the returned object in `createGame`:

```ts
switchLanguage(config: GameConfig) {
  const { answer, dictionary, language } = config;
  const nextWords = createWordLookup(dictionary);
  const nextAnswer = toAnswerEntry(answer);
  state.answer = nextAnswer.text;
  state.answerKey = nextAnswer.key;
  state.guesses = [];
  state.evaluations = [];
  state.currentGuess = '';
  state.status = 'playing';
  state.message = messages[language].gameReset;
  state.keyState.clear();
  state.language = language;
  // re-bind internal words lookup so submitGuess uses new dictionary
  Object.assign(words, nextWords);
}
```

Because `createWordLookup` returns a fresh object, you must refactor `createGame` to hold the lookup object in a mutable variable. Update `submitGuess` to use that variable.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/game.ts test/game.test.ts
git commit -m "feat(game): add switchLanguage to restart in another language"
```

---

## Phase 2: English + Brazilian Portuguese dictionaries and mid-game switching

### Task 2.1: Source and normalize English word lists

**Files:**
- Create: `scripts/fetch-en-words.ts`
- Create: `src/dict/en/all.json`
- Create: `src/dict/en/answers.json`

- [ ] **Step 1: Create the fetch script**

```ts
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const WORD_LENGTH = 5;

function normalize(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

async function fetchWordleList(url: string): Promise<string[]> {
  const res = await fetch(url);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map(normalize)
    .filter((w) => w.length === WORD_LENGTH);
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/dict/en');
  await fs.mkdir(outDir, { recursive: true });

  const allWords = new Set<string>();
  const answers = new Set<string>();

  // Wordle guess list (larger, public lists exist in many repos)
  const guessUrl = 'https://raw.githubusercontent.com/tabatkins/wordle-list/main/list.txt';
  const guesses = await fetchWordleList(guessUrl);
  for (const w of guesses) allWords.add(w);

  // NYT-style curated answer list (public-domain derived lists)
  const answerUrl = 'https://raw.githubusercontent.com/Kinkelin/WordleCompetition/main/data/words.txt';
  const answerList = await fetchWordleList(answerUrl);
  for (const w of answerList) {
    allWords.add(w);
    answers.add(w);
  }

  const allSorted = Array.from(allWords).sort();
  const answersSorted = Array.from(answers).sort();

  await fs.writeFile(
    path.join(outDir, 'all.json'),
    JSON.stringify(allSorted, null, 2)
  );
  await fs.writeFile(
    path.join(outDir, 'answers.json'),
    JSON.stringify(answersSorted.map((key) => ({ key, text: key })), null, 2)
  );

  console.log(`English: ${allSorted.length} guesses, ${answersSorted.length} answers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

```bash
npx ts-node scripts/fetch-en-words.ts
```

Expected: creates `src/dict/en/all.json` and `src/dict/en/answers.json` with counts printed.

> If `ts-node` is unavailable, run `npx tsc scripts/fetch-en-words.ts && node scripts/fetch-en-words.js` then delete the JS, or add a one-off `tsx` dependency.

- [ ] **Step 3: Verify files**

Run:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('src/dict/en/all.json')).length)"
node -e "console.log(JSON.parse(require('fs').readFileSync('src/dict/en/answers.json')).length)"
```

Expected: non-zero counts (likely ~13k and ~2k).

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-en-words.ts src/dict/en/
git commit -m "data(dict): add English word and answer lists"
```

---

### Task 2.2: Migrate Portuguese data to `src/dict/pt/`

**Files:**
- Create: `src/dict/pt/all.json`
- Create: `src/dict/pt/answers.json`
- Delete: `src/word-data.ts` (after migration)
- Modify: `src/words.ts`

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-pt-dict.ts`:

```ts
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { WORD_DICTIONARY, ANSWER_WORDS } from '../src/word-data';

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/dict/pt');
  await fs.mkdir(outDir, { recursive: true });

  const all = Object.keys(WORD_DICTIONARY).sort();
  await fs.writeFile(
    path.join(outDir, 'all.json'),
    JSON.stringify(all, null, 2)
  );

  const answers = ANSWER_WORDS.sort((a, b) => a.key.localeCompare(b.key));
  await fs.writeFile(
    path.join(outDir, 'answers.json'),
    JSON.stringify(answers, null, 2)
  );

  console.log(`Portuguese: ${all.length} guesses, ${answers.length} answers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the migration**

```bash
npx ts-node scripts/migrate-pt-dict.ts
```

Expected: creates `src/dict/pt/all.json` and `src/dict/pt/answers.json`.

- [ ] **Step 3: Create dictionary loader**

Create `src/dictionary.ts`:

```ts
import { Language } from './i18n';
import { WordEntry } from './game';

export interface WordBank {
  language: Language;
  allWords: Readonly<Record<string, string>>;
  answers: readonly WordEntry[];
}

const cache: Partial<Record<Language, WordBank>> = {};

export async function loadWordBank(language: Language): Promise<WordBank> {
  if (cache[language]) return cache[language]!;

  const all: string[] = await import(`./dict/${language}/all.json`, { assert: { type: 'json' } }).then((m) => m.default);
  const answers: WordEntry[] = await import(`./dict/${language}/answers.json`, { assert: { type: 'json' } }).then((m) => m.default);

  const allWords: Record<string, string> = {};
  for (const key of all) {
    if (!allWords[key]) allWords[key] = key;
  }

  const bank: WordBank = {
    language,
    allWords,
    answers,
  };
  cache[language] = bank;
  return bank;
}

export function defaultLanguage(): Language {
  const locale = process.env.WORDLE_LANG || Intl.DateTimeFormat().resolvedOptions().locale;
  return locale.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}
```

> Node JSON dynamic imports with `assert { type: 'json' }` require Node 18+; the repo already targets Node with `type: 'commonjs'`, so `tsc` will emit these as dynamic `import()` calls. Ensure `tsconfig.json` includes `"resolveJsonModule": true` if static imports are used anywhere.

- [ ] **Step 4: Test dictionary loader**

Create `test/dictionary.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLanguage, loadWordBank } from '../src/dictionary';

test('loadWordBank loads english and portuguese banks', async () => {
  const en = await loadWordBank('en');
  assert.equal(en.language, 'en');
  assert.ok(Object.keys(en.allWords).length > 1000);
  assert.ok(en.answers.length > 100);

  const pt = await loadWordBank('pt');
  assert.equal(pt.language, 'pt');
  assert.ok(Object.keys(pt.allWords).length > 1000);
  assert.ok(en.answers.length > 100);
});

test('defaultLanguage respects WORDLE_LANG', () => {
  const original = process.env.WORDLE_LANG;
  process.env.WORDLE_LANG = 'pt-BR';
  assert.equal(defaultLanguage(), 'pt');
  process.env.WORDLE_LANG = 'en-US';
  assert.equal(defaultLanguage(), 'en');
  process.env.WORDLE_LANG = original;
});
```

Run: `npm test`
Expected: PASS after English lists exist and Portuguese migration is complete.

- [ ] **Step 5: Delete `src/word-data.ts` and commit**

After confirming tests pass:

```bash
rm src/word-data.ts
git add src/dictionary.ts test/dictionary.test.ts src/dict/pt/ src/words.ts
git rm src/word-data.ts
git commit -m "refactor(dict): migrate Portuguese data to src/dict/pt and add loader"
```

---

### Task 2.3: Update `words.ts` for per-language daily answer

**Files:**
- Modify: `src/words.ts`
- Modify: `test/game.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/game.test.ts`:

```ts
test('daily answer uses Wordle epoch for English and Termo epoch for Portuguese', () => {
  const en = { answers: [{ key: 'apple', text: 'apple' }, { key: 'berry', text: 'berry' }] };
  const pt = { answers: [{ key: 'termo', text: 'termo' }, { key: 'sabio', text: 'sábio' }] };

  const date = new Date('2026-05-20T12:00:00-03:00');
  assert.deepEqual(dailyAnswer('en', en.answers, date), dailyAnswer('en', en.answers, date));
  assert.deepEqual(dailyAnswer('pt', pt.answers, date), dailyAnswer('pt', pt.answers, date));
  assert.notDeepEqual(dailyAnswer('en', en.answers, date), dailyAnswer('pt', pt.answers, date));
});
```

Run: `npm run build && node --test dist/test/game.test.js`
Expected: FAIL, signature changed.

- [ ] **Step 2: Update `src/words.ts`**

```ts
import { Language } from './i18n';
import { WordBank } from './dictionary';
import { WordEntry } from './game';

export { WordBank } from './dictionary';

function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function daysSinceEpoch(date: Date, epoch: Date, timeZone: string): number {
  const [year, month, day] = dateKey(date, timeZone).split('-').map(Number);
  const today = Date.UTC(year, month - 1, day);
  return Math.floor((today - epoch.getTime()) / 86_400_000);
}

export function dailyAnswer(language: Language, answers: readonly WordEntry[], date = new Date()): WordEntry {
  if (answers.length === 0) {
    throw new Error('answer list cannot be empty');
  }

  const epoch = language === 'pt'
    ? new Date(Date.UTC(2022, 0, 5))
    : new Date(Date.UTC(2021, 5, 19));
  const timeZone = language === 'pt' ? 'America/Sao_Paulo' : 'UTC';
  const day = daysSinceEpoch(date, epoch, timeZone);
  const index = Math.abs(day * 2_654_435_761) % answers.length;
  return answers[index];
}
```

Remove the old `loadWordBank` and `randomAnswer` exports from `src/words.ts`; dictionary loading now lives in `src/dictionary.ts`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/words.ts test/game.test.ts
git commit -m "feat(words): per-language daily answer with correct epoch"
```

---

### Task 2.4: Add mid-game language switch in the TUI

**Files:**
- Modify: `src/index.ts`
- Modify: `test/game.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/game.test.ts`:

```ts
test('isLanguageSwitchCommand detects L mid-game', () => {
  assert.equal(isLanguageSwitchCommand({ name: 'l', ctrl: false }, 'playing'), true);
  assert.equal(isLanguageSwitchCommand({ name: 'l', ctrl: false }, 'won'), true);
  assert.equal(isLanguageSwitchCommand({ name: 'L', ctrl: false }, 'playing'), false);
});
```

Run: `npm run build && node --test dist/test/game.test.js`
Expected: FAIL, function missing.

- [ ] **Step 2: Update `src/index.ts`**

Add:

```ts
import { Language } from './i18n';
import { loadWordBank } from './dictionary';

export function isLanguageSwitchCommand(key: Pick<Key, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return !key.ctrl && key.name === 'l';
}

function otherLanguage(language: Language): Language {
  return language === 'en' ? 'pt' : 'en';
}
```

Change `run()` to hold `currentLanguage` and `currentBank` as mutable variables, load both banks at startup, and handle `l`:

```ts
const initialLanguage: Language = defaultLanguage();
let currentLanguage = initialLanguage;
let enBank = await loadWordBank('en');
let ptBank = await loadWordBank('pt');

function bankFor(language: Language) {
  return language === 'en' ? enBank : ptBank;
}

const todayAnswer = dailyAnswer(currentLanguage, bankFor(currentLanguage).answers);
const game = createGame({
  answer: todayAnswer,
  dictionary: bankFor(currentLanguage).allWords,
  language: currentLanguage,
});
game.state.message = messages[currentLanguage].dailyLoaded(Object.keys(bankFor(currentLanguage).allWords).length);
```

In the keypress handler, add before the letter input branch:

```ts
if (isLanguageSwitchCommand(key, game.state.status)) {
  currentLanguage = otherLanguage(currentLanguage);
  const bank = bankFor(currentLanguage);
  const answer = dailyAnswer(currentLanguage, bank.answers);
  game.switchLanguage({ answer, dictionary: bank.allWords, language: currentLanguage });
  game.state.message = messages[currentLanguage].gameReset;
  draw(game);
  return;
}
```

Update `draw()` title, subtitle, controls, and status line to use `messages[game.state.language]`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

```bash
npm run build
npx --yes .
```

Press `l` while playing. Expected: game resets in the other language with the correct daily word.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/game.test.ts
git commit -m "feat(ui): mid-game language switching with L key"
```

---

## Phase 3: Information-theory tips tab

### Task 3.1: Build the constraint filter

**Files:**
- Create: `src/solver.ts`
- Create: `test/solver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCandidates, patternKey } from '../src/solver';
import { TILE } from '../src/game';

test('filterCandidates narrows to words matching all evaluations', () => {
  const candidates = ['sassy', 'salty', 'saint', 'sails', 'sabot'];
  const result = filterCandidates(candidates, [
    { guess: 'salty', evals: [TILE.CORRECT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT] },
  ]);
  assert.deepEqual(result, ['sassy', 'saint', 'sails', 'sabot']);
});

test('patternKey groups candidates by feedback', () => {
  const key = patternKey('salty', 'salty');
  assert.equal(key, 'CCCCC');
});
```

Run: `npm run build && node --test dist/test/solver.test.js`
Expected: FAIL, modules missing.

- [ ] **Step 2: Implement `src/solver.ts`**

```ts
import { evaluateGuess, normalizeWord, TileState, TILE, WORD_LENGTH } from './game';

export interface GuessEvaluation {
  guess: string;
  evals: TileState[];
}

export function patternKey(guess: string, answer: string): string {
  const evals = evaluateGuess(guess, answer);
  return evals.map((e) => {
    if (e === TILE.CORRECT) return 'C';
    if (e === TILE.PRESENT) return 'P';
    return 'A';
  }).join('');
}

export function filterCandidates(candidates: string[], history: GuessEvaluation[]): string[] {
  return candidates.filter((candidate) => {
    for (const { guess, evals } of history) {
      if (patternKey(guess, candidate) !== evalsToKey(evals)) {
        return false;
      }
    }
    return true;
  });
}

function evalsToKey(evals: TileState[]): string {
  return evals.map((e) => {
    if (e === TILE.CORRECT) return 'C';
    if (e === TILE.PRESENT) return 'P';
    return 'A';
  }).join('');
}

function normalizeAll(words: string[]): string[] {
  return words.map(normalizeWord);
}

export { normalizeAll };
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/solver.ts test/solver.test.ts
git commit -m "feat(solver): add candidate filtering and pattern keys"
```

---

### Task 3.2: Implement entropy and best-probability calculators

**Files:**
- Modify: `src/solver.ts`
- Modify: `test/solver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('entropyOfGuess computes expected bits for a small candidate set', () => {
  const candidates = ['aback', 'abbey', 'abbot', 'about'];
  const info = entropyOfGuess('aahed', candidates);
  assert.ok(typeof info === 'number');
  assert.ok(info >= 0);
});

test('rankGuesses returns sorted suggestions', () => {
  const candidates = ['aback', 'abbey', 'abbot'];
  const ranked = rankGuesses(candidates, candidates);
  assert.ok(ranked.length > 0);
  assert.ok(ranked[0].entropy >= ranked[ranked.length - 1].entropy);
});
```

Run: `npm run build && node --test dist/test/solver.test.js`
Expected: FAIL, functions missing.

- [ ] **Step 2: Implement entropy ranking**

Append to `src/solver.ts`:

```ts
export interface GuessScore {
  guess: string;
  entropy: number;
  topPattern: string;
  topPatternCount: number;
}

export function entropyOfGuess(guess: string, candidates: string[]): number {
  const buckets = new Map<string, number>();
  for (const answer of candidates) {
    const key = patternKey(guess, answer);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const total = candidates.length;
  let entropy = 0;
  for (const count of buckets.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function rankGuesses(guesses: string[], candidates: string[]): GuessScore[] {
  const scored: GuessScore[] = [];
  for (const guess of guesses) {
    const buckets = new Map<string, number>();
    for (const answer of candidates) {
      const key = patternKey(guess, answer);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    const total = candidates.length || 1;
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
```

- [ ] **Step 3: Add best-win-probability helper**

Append:

```ts
export function bestWinProbabilityGuess(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  // A guess that is itself a candidate guarantees a win if it is the answer,
  // and also provides information if it is not. For a first approximation,
  // prefer the candidate with highest entropy among candidates.
  const ranked = rankGuesses(candidates, candidates);
  return ranked[0]?.guess ?? null;
}
```

> The 3Blue1Brown video uses expected entropy; a separate "best probability" metric can be added later (e.g. minimax over remaining candidates). This first version exposes both entropy ranking and a candidate-only high-entropy suggestion.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver.ts test/solver.test.ts
git commit -m "feat(solver): rank guesses by expected entropy"
```

---

### Task 3.3: Render the tips tab

**Files:**
- Create: `src/tips.ts`
- Create: `test/tips.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTips } from '../src/tips';

test('renderTips includes candidate count and top suggestions', () => {
  const lines = renderTips({
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
  assert.match(text, /3 candidates/);
  assert.match(text, /apple/);
  assert.match(text, /2\.50 bits/);
});
```

Run: `npm run build && node --test dist/test/tips.test.js`
Expected: FAIL, module missing.

- [ ] **Step 2: Implement `src/tips.ts`**

```ts
import { Language, messages } from './i18n';
import { GuessScore } from './solver';

export interface TipsRenderInput {
  language: Language;
  candidates: string[];
  ranked: GuessScore[];
  bestCandidate: string | null;
  width: number;
}

function center(line: string, width: number): string {
  if (line.length >= width) return line;
  const pad = Math.floor((width - line.length) / 2);
  return `${' '.repeat(pad)}${line}`;
}

export function renderTips(input: TipsRenderInput): string[] {
  const { language, candidates, ranked, bestCandidate, width } = input;
  const strings = messages[language];
  const lines: string[] = [];

  lines.push('');
  lines.push(center(`${strings.title} — Tips`, width));
  lines.push(center(`Candidates remaining: ${candidates.length}`, width));
  if (bestCandidate) {
    lines.push(center(`Best candidate-only guess: ${bestCandidate.toUpperCase()}`, width));
  }
  lines.push('');
  lines.push(center('Top guesses by expected information (bits)', width));
  lines.push('');

  const top = ranked.slice(0, 8);
  if (top.length === 0) {
    lines.push(center('No suggestions available.', width));
  } else {
    for (const item of top) {
      const line = `${item.guess.toUpperCase().padEnd(8)} ${item.entropy.toFixed(2)} bits`;
      lines.push(center(line, width));
    }
  }

  lines.push('');
  lines.push(center('Press Tab to return to the game.', width));
  lines.push('');
  return lines;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tips.ts test/tips.test.ts
git commit -m "feat(tips): render information-theory suggestions tab"
```

---

### Task 3.4: Wire the tips tab into the TUI

**Files:**
- Modify: `src/index.ts`
- Modify: `test/game.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('isTipsCommand detects Tab mid-game', () => {
  assert.equal(isTipsCommand({ name: 'tab', ctrl: false }, 'playing'), true);
  assert.equal(isTipsCommand({ name: 'tab', ctrl: false }, 'won'), true);
});
```

Run: `npm run build && node --test dist/test/game.test.js`
Expected: FAIL, function missing.

- [ ] **Step 2: Update `src/index.ts`**

Add:

```ts
import { filterCandidates, rankGuesses, bestWinProbabilityGuess } from './solver';
import { renderTips } from './tips';

export function isTipsCommand(key: Pick<Key, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return !key.ctrl && key.name === 'tab';
}
```

In `run()`, add a mutable view state:

```ts
let view: 'game' | 'tips' = 'game';
```

Create a `drawTips()` function:

```ts
function drawTips() {
  const bank = bankFor(game.state.language);
  const allGuessKeys = Object.keys(bank.allWords);
  const history = game.state.guesses.map((guess, i) => ({
    guess: normalizeWord(guess),
    evals: game.state.evaluations[i],
  }));
  const candidates = filterCandidates(bank.answers.map((a) => a.key), history);
  const ranked = rankGuesses(allGuessKeys, candidates);
  const bestCandidate = bestWinProbabilityGuess(candidates);

  const lines = renderTips({
    language: game.state.language,
    candidates,
    ranked,
    bestCandidate,
    width: process.stdout.columns || 80,
  });

  process.stdout.write(terminal.clearScreen);
  process.stdout.write(lines.join('\n'));
}
```

In the keypress handler, handle Tab:

```ts
if (isTipsCommand(key, game.state.status)) {
  view = view === 'game' ? 'tips' : 'game';
  if (view === 'tips') drawTips();
  else draw(game);
  return;
}
```

Update `draw()` call sites to respect the view, and after a guess always switch back to `game` view.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

```bash
npm run build
npx --yes .
```

Type a guess, press Tab. Expected: tips tab appears with candidate count and ranked guesses. Press Tab again to return.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/game.test.ts
git commit -m "feat(ui): add Tab tips tab with entropy-ranked suggestions"
```

---

## Phase 4: MCP server for agent play

### Task 4.1: Add MCP SDK dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install SDK**

```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Update `package.json` scripts**

Add:

```json
"mcp": "npm run build && node dist/src/mcp.js"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @modelcontextprotocol/sdk for MCP server"
```

---

### Task 4.2: Implement MCP server

**Files:**
- Create: `src/mcp.ts`
- Create: `test/mcp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameStateResponse } from '../src/mcp';
import { createGame } from '../src/game';

test('buildGameStateResponse returns serializable state', () => {
  const game = createGame({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
  const state = buildGameStateResponse(game);
  assert.equal(state.status, 'playing');
  assert.equal(state.grid.length, 6);
  assert.equal(state.language, 'en');
});
```

Run: `npm run build && node --test dist/test/mcp.test.js`
Expected: FAIL, module missing.

- [ ] **Step 2: Implement `src/mcp.ts`**

```ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { createGame, GameState, MAX_GUESSES, TILE } from './game';
import { loadWordBank, WordBank } from './dictionary';
import { defaultLanguage, Language, messages } from './i18n';
import { dailyAnswer } from './words';
import { normalizeWord } from './game';
import { filterCandidates, rankGuesses, bestWinProbabilityGuess } from './solver';

interface GameSession {
  game: ReturnType<typeof createGame>;
  enBank: WordBank;
  ptBank: WordBank;
}

function buildGrid(state: GameState) {
  const rows = [];
  for (let r = 0; r < MAX_GUESSES; r += 1) {
    if (r < state.guesses.length) {
      rows.push(state.guesses[r].split('').map((ch, c) => ({
        letter: ch.toUpperCase(),
        state: state.evaluations[r][c],
      })));
    } else if (r === state.guesses.length) {
      rows.push(state.currentGuess.split('').map((ch) => ({ letter: ch.toUpperCase(), state: TILE.EMPTY })));
      while (rows[r].length < 5) rows[r].push({ letter: ' ', state: TILE.EMPTY });
    } else {
      rows.push(Array(5).fill({ letter: ' ', state: TILE.EMPTY }));
    }
  }
  return rows;
}

export function buildGameStateResponse(game: GameSession['game']) {
  const state = game.state;
  return {
    language: state.language,
    status: state.status,
    message: state.message,
    guessesUsed: state.guesses.length,
    guessesRemaining: MAX_GUESSES - state.guesses.length,
    grid: buildGrid(state),
    keyboard: Array.from(state.keyState.entries()).map(([letter, state]) => ({ letter, state })),
  };
}

async function createSession(language: Language = defaultLanguage()): Promise<GameSession> {
  const [enBank, ptBank] = await Promise.all([loadWordBank('en'), loadWordBank('pt')]);
  const bank = language === 'en' ? enBank : ptBank;
  const answer = dailyAnswer(language, bank.answers);
  const game = createGame({ answer, dictionary: bank.allWords, language });
  game.state.message = messages[language].dailyLoaded(Object.keys(bank.allWords).length);
  return { game, enBank, ptBank };
}

async function main() {
  let session = await createSession();

  const server = new Server(
    { name: 'wordle-tui-mcp', version: '1.3.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'start_game',
        description: 'Start a new game in English or Portuguese.',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string', enum: ['en', 'pt'] },
          },
        },
      },
      {
        name: 'get_state',
        description: 'Get the current grid, keyboard state, and message.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'submit_guess',
        description: 'Submit a 5-letter guess.',
        inputSchema: {
          type: 'object',
          properties: {
            guess: { type: 'string', minLength: 5, maxLength: 5 },
          },
          required: ['guess'],
        },
      },
      {
        name: 'switch_language',
        description: 'Switch language and restart the daily word.',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string', enum: ['en', 'pt'] },
          },
          required: ['language'],
        },
      },
      {
        name: 'get_tips',
        description: 'Get entropy-ranked suggestions and remaining candidate count.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const content: TextContent[] = [];

    if (name === 'start_game') {
      const language = (args?.language as Language) || defaultLanguage();
      session = await createSession(language);
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'get_state') {
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'submit_guess') {
      const guess = String(args?.guess || '').toLowerCase();
      for (const ch of guess) session.game.addLetter(ch);
      session.game.submitGuess();
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'switch_language') {
      const language = String(args?.language || 'en') as Language;
      const bank = language === 'en' ? session.enBank : session.ptBank;
      const answer = dailyAnswer(language, bank.answers);
      session.game.switchLanguage({ answer, dictionary: bank.allWords, language });
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'get_tips') {
      const bank = session.game.state.language === 'en' ? session.enBank : session.ptBank;
      const history = session.game.state.guesses.map((guess, i) => ({
        guess: normalizeWord(guess),
        evals: session.game.state.evaluations[i],
      }));
      const candidates = filterCandidates(bank.answers.map((a) => a.key), history);
      const ranked = rankGuesses(Object.keys(bank.allWords), candidates);
      content.push({
        type: 'text',
        text: JSON.stringify({
          candidatesRemaining: candidates.length,
          bestCandidate: bestWinProbabilityGuess(candidates),
          topSuggestions: ranked.slice(0, 5).map((r) => ({ guess: r.guess, entropy: r.entropy })),
        }, null, 2),
      });
    } else {
      content.push({ type: 'text', text: `Unknown tool: ${name}` });
    }

    return { content };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { createSession };
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mcp.ts test/mcp.test.ts
git commit -m "feat(mcp): add MCP server with game tools"
```

---

### Task 4.3: Add `--mcp` CLI flag

**Files:**
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Update `src/index.ts`**

At the bottom, replace the `if (require.main === module)` block:

```ts
if (require.main === module) {
  if (process.argv.includes('--mcp')) {
    import('./mcp').then((mcp) => mcp.main()).catch((error) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    });
  } else {
    run().catch((error) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    });
  }
}
```

- [ ] **Step 2: Smoke test MCP server**

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/src/index.js --mcp
```

Expected: JSON response listing the five tools.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat(cli): add --mcp flag to run MCP server"
```

---

## Self-review

### Spec coverage

| Requirement | Task |
|-------------|------|
| 3-step build plan (engine → languages → tips) | Phase 1, Phase 2, Phase 3 |
| Mid-game language switching | Task 2.4 |
| Four dictionaries (en all/answers, pt all/answers) | Tasks 2.1, 2.2 |
| Open/public-domain word lists | Task 2.1 (script fetches public lists) |
| Information-theory tips tab | Phase 3 |
| MCP playable | Phase 4 |

### Placeholder scan

No `TODO`, `TBD`, or vague "implement later" steps remain. Every task includes exact file paths, runnable commands, expected outputs, and code.

### Type consistency

- `Language` is defined once in `src/i18n.ts` and reused everywhere.
- `WordBank` is defined in `src/dictionary.ts` and imported by `src/words.ts` and `src/mcp.ts`.
- `GameConfig` and `GameState` live in `src/game.ts` and are reused by `src/mcp.ts`.
- `GuessScore` and `GuessEvaluation` live in `src/solver.ts` and are reused by `src/tips.ts` and `src/mcp.ts`.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-bilingual-wordle-with-tips-and-mcp.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach do you want?