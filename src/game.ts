import { GameStrings, Language, messages } from './i18n';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export const TILE = {
  EMPTY: 'empty',
  ABSENT: 'absent',
  PRESENT: 'present',
  CORRECT: 'correct',
} as const;

export type TileState = (typeof TILE)[keyof typeof TILE];
export type GameStatus = 'playing' | 'won' | 'lost';

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

export interface WordEntry {
  readonly key: string;
  readonly text: string;
}

export type WordDictionary = Readonly<Record<string, true | string>> | ReadonlySet<string> | readonly string[];

export function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function evaluateGuess(guess: string, answer: string): TileState[] {
  const guessKey = normalizeWord(guess);
  const answerKey = normalizeWord(answer);

  if (guessKey.length !== WORD_LENGTH || answerKey.length !== WORD_LENGTH) {
    throw new Error('guess and answer must be 5 letters');
  }

  const result: TileState[] = new Array(WORD_LENGTH).fill(TILE.ABSENT);
  const answerChars: Array<string | null> = answerKey.split('');
  const remaining = new Map<string, number>();

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guessKey[i] === answerChars[i]) {
      result[i] = TILE.CORRECT;
      answerChars[i] = null;
    }
  }

  for (const ch of answerChars) {
    if (!ch) continue;
    remaining.set(ch, (remaining.get(ch) || 0) + 1);
  }

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (result[i] === TILE.CORRECT) continue;
    const count = remaining.get(guessKey[i]) || 0;
    if (count > 0) {
      result[i] = TILE.PRESENT;
      remaining.set(guessKey[i], count - 1);
    }
  }

  return result;
}

interface WordLookup {
  has: (word: string) => boolean;
  display: (word: string) => string;
  size: number;
}

function createWordLookup(words: WordDictionary): WordLookup {
  const dictionary = new Map<string, string>();

  if (Array.isArray(words)) {
    for (const word of words) {
      const key = normalizeWord(word);
      if (!dictionary.has(key)) dictionary.set(key, word.toLowerCase());
    }
  } else if (words instanceof Set) {
    for (const word of words) {
      const key = normalizeWord(word);
      if (!dictionary.has(key)) dictionary.set(key, word.toLowerCase());
    }
  } else {
    for (const [key, value] of Object.entries(words)) {
      dictionary.set(normalizeWord(key), value === true ? key : value);
    }
  }

  return {
    has: (word) => dictionary.has(normalizeWord(word)),
    display: (word) => dictionary.get(normalizeWord(word)) || normalizeWord(word),
    size: dictionary.size,
  };
}

function toAnswerEntry(answer: string | WordEntry): WordEntry {
  if (typeof answer === 'string') {
    return { key: normalizeWord(answer), text: answer.toLowerCase() };
  }

  return {
    key: normalizeWord(answer.key),
    text: answer.text.toLowerCase(),
  };
}

function isGameConfig(value: unknown): value is GameConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'answer' in value &&
    'dictionary' in value &&
    'language' in value
  );
}

export function createGame(config: GameConfig): ReturnType<typeof buildGame>;
export function createGame(answer: string | WordEntry, dictionary: WordDictionary): ReturnType<typeof buildGame>;
export function createGame(
  configOrAnswer: GameConfig | string | WordEntry,
  maybeDictionary?: WordDictionary,
) {
  const config = isGameConfig(configOrAnswer)
    ? configOrAnswer
    : { answer: configOrAnswer, dictionary: maybeDictionary!, language: 'pt' as Language };
  return buildGame(config);
}

function buildGame(config: GameConfig) {
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
    message: strings.dailyLoaded(words.size),
    keyState: new Map(),
    language,
  };

  function updateKeyboard(guess: string, evals: TileState[]) {
    const rank: Record<TileState, number> = { [TILE.EMPTY]: 0, [TILE.ABSENT]: 1, [TILE.PRESENT]: 2, [TILE.CORRECT]: 3 };
    for (let i = 0; i < guess.length; i += 1) {
      const ch = guess[i];
      const score = evals[i];
      const prev = state.keyState.get(ch) || TILE.EMPTY;
      if (rank[score] > rank[prev]) state.keyState.set(ch, score);
    }
  }

  return {
    state,
    addLetter(ch: string) {
      if (state.status !== 'playing') return;
      const letter = normalizeWord(ch);
      if (!/^[a-z]$/.test(letter)) return;
      if (state.currentGuess.length >= WORD_LENGTH) return;
      state.currentGuess += letter;
      state.message = '';
    },
    backspace() {
      if (state.status !== 'playing') return;
      state.currentGuess = state.currentGuess.slice(0, -1);
    },
    submitGuess() {
      if (state.status !== 'playing') return false;
      if (state.currentGuess.length !== WORD_LENGTH) {
        state.message = strings.wrongLength;
        return false;
      }
      if (!words.has(state.currentGuess)) {
        state.message = strings.notInDictionary;
        return false;
      }

      const guessKey = normalizeWord(state.currentGuess);
      const guessText = words.display(guessKey);
      const evals = evaluateGuess(guessKey, state.answerKey);
      state.guesses.push(guessText);
      state.evaluations.push(evals);
      updateKeyboard(guessKey, evals);

      if (guessKey === state.answerKey) {
        state.status = 'won';
        state.message = strings.winMessage(state.guesses.length);
      } else if (state.guesses.length >= MAX_GUESSES) {
        state.status = 'lost';
        state.message = strings.loseMessage(state.answer);
      } else {
        state.message = strings.guessRegistered(state.guesses.length);
      }

      state.currentGuess = '';
      return true;
    },
    reset(nextAnswer: string | WordEntry) {
      const nextAnswerEntry = toAnswerEntry(nextAnswer);
      state.answer = nextAnswerEntry.text;
      state.answerKey = nextAnswerEntry.key;
      state.guesses = [];
      state.evaluations = [];
      state.currentGuess = '';
      state.status = 'playing';
      state.message = strings.gameReset;
      state.keyState.clear();
    },
  };
}
