import { messages } from './i18n';
import type { Language } from './i18n';

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
export type PuzzleMode = 'daily' | 'practice';
export type GuessSlot = string | null;
export type EditableGuess = readonly [GuessSlot, GuessSlot, GuessSlot, GuessSlot, GuessSlot];
type MutableEditableGuess = [GuessSlot, GuessSlot, GuessSlot, GuessSlot, GuessSlot];

export type GuessInputError =
  | { code: 'invalid_length' }
  | { code: 'invalid_chars' }
  | { code: 'not_in_dictionary' }
  | { code: 'hard_mode_violation'; message: string }
  | { code: 'game_over' };

export type SetCurrentGuessResult =
  | { ok: true }
  | { ok: false; error: GuessInputError };

export type SubmitGuessResult =
  | { ok: true }
  | { ok: false; error: GuessInputError };

export type UndoGuessResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'blocked' };

export interface GameConfig {
  answer: string | WordEntry;
  dictionary: WordDictionary;
  language: Language;
  hardMode?: boolean;
  mode?: PuzzleMode;
  /** Defaults to MAX_GUESSES for daily; use Number.POSITIVE_INFINITY for practice. */
  maxGuesses?: number;
}

export interface GameState {
  answer: string;
  answerKey: string;
  guesses: string[];
  evaluations: TileState[][];
  /** Sparse editable row: null means empty slot. */
  slots: EditableGuess;
  cursorPosition: number;
  status: GameStatus;
  message: string;
  keyState: Map<string, TileState>;
  language: Language;
  hardMode: boolean;
  mode: PuzzleMode;
  maxGuesses: number;
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

export function createEmptySlots(): EditableGuess {
  return [null, null, null, null, null];
}

export function cloneSlots(slots: EditableGuess): EditableGuess {
  return [slots[0], slots[1], slots[2], slots[3], slots[4]];
}

export function isRowComplete(slots: EditableGuess): boolean {
  return slots.every((slot) => slot !== null);
}

/** Joined word when all five slots are filled; otherwise null. */
export function slotsWord(slots: EditableGuess): string | null {
  if (!isRowComplete(slots)) return null;
  return `${slots[0]}${slots[1]}${slots[2]}${slots[3]}${slots[4]}`;
}

/** End cursor: first trailing null, or WORD_LENGTH when the row is full. */
export function endCursorPosition(slots: EditableGuess): number {
  let lastFilled = -1;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (slots[i] !== null) lastFilled = i;
  }
  if (lastFilled === WORD_LENGTH - 1 && isRowComplete(slots)) return WORD_LENGTH;
  // First trailing null = index after the rightmost filled slot (0 when empty).
  // Sparse holes before the rightmost filled letter are not "trailing".
  for (let i = lastFilled + 1; i < WORD_LENGTH; i += 1) {
    if (slots[i] === null) return i;
  }
  return WORD_LENGTH;
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

/**
 * Official Wordle hard-mode constraints over prior guesses:
 * - every previously correct (green) letter/position must stay in place;
 * - every previously present/correct letter must appear at least as many times
 *   as the maximum (present + correct) multiplicity revealed in any single prior guess.
 */
export function checkHardModeConstraints(
  guessKey: string,
  priorGuesses: readonly string[],
  priorEvaluations: readonly TileState[][],
  language: Language,
): Extract<GuessInputError, { code: 'hard_mode_violation' }> | null {
  const strings = messages[language];
  const guessChars = guessKey.split('');

  // Fixed greens from any prior evaluation.
  for (let g = 0; g < priorGuesses.length; g += 1) {
    const priorKey = normalizeWord(priorGuesses[g]);
    const evals = priorEvaluations[g] ?? [];
    for (let i = 0; i < WORD_LENGTH; i += 1) {
      if (evals[i] !== TILE.CORRECT) continue;
      if (guessChars[i] !== priorKey[i]) {
        return {
          code: 'hard_mode_violation',
          message: strings.hardModeMustUsePosition(i + 1, priorKey[i]),
        };
      }
    }
  }

  // Minimum multiplicity of each revealed present/correct letter across prior guesses.
  const required = new Map<string, number>();
  for (let g = 0; g < priorGuesses.length; g += 1) {
    const priorKey = normalizeWord(priorGuesses[g]);
    const evals = priorEvaluations[g] ?? [];
    const counts = new Map<string, number>();
    for (let i = 0; i < WORD_LENGTH; i += 1) {
      if (evals[i] === TILE.CORRECT || evals[i] === TILE.PRESENT) {
        counts.set(priorKey[i], (counts.get(priorKey[i]) || 0) + 1);
      }
    }
    for (const [letter, count] of counts) {
      required.set(letter, Math.max(required.get(letter) || 0, count));
    }
  }

  const available = new Map<string, number>();
  for (const ch of guessChars) {
    available.set(ch, (available.get(ch) || 0) + 1);
  }

  for (const [letter, count] of required) {
    if ((available.get(letter) || 0) < count) {
      return {
        code: 'hard_mode_violation',
        message: strings.hardModeMustInclude(letter),
      };
    }
  }

  return null;
}

export function rebuildKeyState(
  guesses: readonly string[],
  evaluations: readonly TileState[][],
): Map<string, TileState> {
  const rank: Record<TileState, number> = {
    [TILE.EMPTY]: 0,
    [TILE.ABSENT]: 1,
    [TILE.PRESENT]: 2,
    [TILE.CORRECT]: 3,
  };
  const keyState = new Map<string, TileState>();
  for (let i = 0; i < guesses.length; i += 1) {
    const guess = normalizeWord(guesses[i]);
    const evals = evaluations[i] ?? [];
    for (let j = 0; j < guess.length; j += 1) {
      const ch = guess[j];
      const score = evals[j] ?? TILE.ABSENT;
      const prev = keyState.get(ch) || TILE.EMPTY;
      if (rank[score] > rank[prev]) keyState.set(ch, score);
    }
  }
  return keyState;
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
      dictionary.set(normalizeWord(key), value === true ? key.toLowerCase() : String(value).toLowerCase());
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

type ValidatedGuessInput =
  | { ok: true; normalized: string }
  | { ok: false; error: GuessInputError };

function validateGuessInput(word: string): ValidatedGuessInput {
  const normalized = normalizeWord(word);
  if (normalized.length !== WORD_LENGTH) {
    return { ok: false, error: { code: 'invalid_length' } };
  }
  if (!/^[a-z]{5}$/.test(normalized)) {
    return { ok: false, error: { code: 'invalid_chars' } };
  }
  return { ok: true, normalized };
}

function resolveMaxGuesses(mode: PuzzleMode, maxGuesses?: number): number {
  if (typeof maxGuesses === 'number' && Number.isFinite(maxGuesses) && maxGuesses > 0) {
    return Math.trunc(maxGuesses);
  }
  if (mode === 'practice') return Number.POSITIVE_INFINITY;
  if (maxGuesses === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return MAX_GUESSES;
}

export interface EditableRowSnapshot {
  slots: EditableGuess;
  cursorPosition: number;
  message: string;
}

export interface Game {
  state: GameState;
  addLetter(ch: string): void;
  backspace(): void;
  deleteSlot(): void;
  moveCursor(offset: number): void;
  setCursorPosition(position: number | 'end'): void;
  setCurrentGuess(word: string): SetCurrentGuessResult;
  /** Capture editable row for atomic adapters that may need to roll back. */
  captureEditableRow(): EditableRowSnapshot;
  /** Restore a previously captured editable row without touching submitted history. */
  restoreEditableRow(snapshot: EditableRowSnapshot): void;
  submitGuess(): boolean;
  /** Structured submit result used by adapters that need hard-mode error details. */
  submitGuessDetailed(): SubmitGuessResult;
  setHardMode(enabled: boolean): void;
  undoLatestGuess(): UndoGuessResult;
  reset(nextAnswer: string | WordEntry, options?: { hardMode?: boolean; mode?: PuzzleMode; maxGuesses?: number }): void;
  switchLanguage(config: GameConfig): void;
}

function assertLanguage(lang: string): asserts lang is Language {
  if (!(lang === 'en' || lang === 'pt')) {
    throw new Error(`Unsupported language: ${lang}`);
  }
}

export function createGame(config: GameConfig): Game {
  assertLanguage(config.language);
  return buildGame(config);
}

function buildGame(config: GameConfig) {
  const { answer, dictionary, language } = config;
  let strings = messages[language];
  let words = createWordLookup(dictionary);
  const answerEntry = toAnswerEntry(answer);
  if (!words.has(answerEntry.key)) {
    throw new Error(`answer ${answerEntry.key} is not in dictionary`);
  }

  const initialMode: PuzzleMode = config.mode === 'practice' ? 'practice' : 'daily';
  const mutableSlots: MutableEditableGuess = [null, null, null, null, null];
  const state: GameState = {
    answer: answerEntry.text,
    answerKey: answerEntry.key,
    guesses: [],
    evaluations: [],
    slots: cloneSlots(mutableSlots),
    cursorPosition: 0,
    status: 'playing',
    message: strings.dailyLoaded(words.size),
    keyState: new Map(),
    language,
    hardMode: Boolean(config.hardMode),
    mode: initialMode,
    maxGuesses: resolveMaxGuesses(initialMode, config.maxGuesses),
  };

  function syncSlots(): void {
    state.slots = cloneSlots(mutableSlots);
  }

  function clearEditableRow(): void {
    for (let i = 0; i < WORD_LENGTH; i += 1) mutableSlots[i] = null;
    syncSlots();
    state.cursorPosition = 0;
  }

  function updateKeyboard(guess: string, evals: TileState[]) {
    const rank: Record<TileState, number> = {
      [TILE.EMPTY]: 0,
      [TILE.ABSENT]: 1,
      [TILE.PRESENT]: 2,
      [TILE.CORRECT]: 3,
    };
    for (let i = 0; i < guess.length; i += 1) {
      const ch = guess[i];
      const score = evals[i];
      const prev = state.keyState.get(ch) || TILE.EMPTY;
      if (rank[score] > rank[prev]) state.keyState.set(ch, score);
    }
  }

  function clampCursor(position: number): number {
    return Math.max(0, Math.min(position, WORD_LENGTH));
  }

  function guessRegisteredMessage(count: number): string {
    if (state.mode === 'practice' || !Number.isFinite(state.maxGuesses)) {
      return strings.guessRegisteredPractice(count);
    }
    return strings.guessRegistered(count);
  }

  function winMessage(count: number): string {
    if (state.mode === 'practice' || !Number.isFinite(state.maxGuesses)) {
      return strings.winMessagePractice(count);
    }
    return strings.winMessage(count);
  }

  function submitGuessDetailed(): SubmitGuessResult {
    if (state.status !== 'playing') {
      return { ok: false, error: { code: 'game_over' } };
    }

    if (!isRowComplete(state.slots)) {
      state.message = strings.wrongLength;
      return { ok: false, error: { code: 'invalid_length' } };
    }

    const guessKey = slotsWord(state.slots)!;
    if (!words.has(guessKey)) {
      state.message = strings.notInDictionary;
      return { ok: false, error: { code: 'not_in_dictionary' } };
    }

    if (state.hardMode && state.guesses.length > 0) {
      const violation = checkHardModeConstraints(
        guessKey,
        state.guesses,
        state.evaluations,
        state.language,
      );
      if (violation) {
        state.message = violation.message;
        return { ok: false, error: violation };
      }
    }

    const guessText = words.display(guessKey);
    const evals = evaluateGuess(guessKey, state.answerKey);
    state.guesses.push(guessText);
    state.evaluations.push(evals);
    updateKeyboard(guessKey, evals);

    if (guessKey === state.answerKey) {
      state.status = 'won';
      state.message = winMessage(state.guesses.length);
    } else if (state.guesses.length >= state.maxGuesses) {
      state.status = 'lost';
      state.message = strings.loseMessage(state.answer);
    } else {
      state.message = guessRegisteredMessage(state.guesses.length);
    }

    clearEditableRow();
    return { ok: true };
  }

  return {
    state,
    addLetter(ch: string) {
      if (state.status !== 'playing') return;
      const letter = normalizeWord(ch);
      if (!/^[a-z]$/.test(letter)) return;
      const target = Math.min(state.cursorPosition, WORD_LENGTH - 1);
      mutableSlots[target] = letter;
      syncSlots();
      state.cursorPosition = clampCursor(target + 1);
      state.message = '';
    },
    backspace() {
      if (state.status !== 'playing') return;
      if (state.cursorPosition === 0) return;
      const target = state.cursorPosition - 1;
      mutableSlots[target] = null;
      syncSlots();
      state.cursorPosition = target;
      state.message = '';
    },
    deleteSlot() {
      if (state.status !== 'playing') return;
      if (state.cursorPosition >= WORD_LENGTH) return;
      mutableSlots[state.cursorPosition] = null;
      syncSlots();
      state.message = '';
    },
    moveCursor(offset: number) {
      if (state.status !== 'playing') return;
      state.cursorPosition = clampCursor(state.cursorPosition + offset);
    },
    setCursorPosition(position: number | 'end') {
      if (state.status !== 'playing') return;
      if (position === 'end') {
        state.cursorPosition = endCursorPosition(state.slots);
        return;
      }
      state.cursorPosition = clampCursor(position);
    },
    setCurrentGuess(word: string): SetCurrentGuessResult {
      if (state.status !== 'playing') {
        return { ok: false, error: { code: 'game_over' } };
      }

      const validation = validateGuessInput(word);
      if (!validation.ok) return validation;

      const normalized = validation.normalized;
      for (let i = 0; i < WORD_LENGTH; i += 1) {
        mutableSlots[i] = normalized[i];
      }
      syncSlots();
      state.cursorPosition = WORD_LENGTH;
      state.message = '';
      return { ok: true };
    },
    captureEditableRow(): EditableRowSnapshot {
      return {
        slots: cloneSlots(state.slots),
        cursorPosition: state.cursorPosition,
        message: state.message,
      };
    },
    restoreEditableRow(snapshot: EditableRowSnapshot): void {
      for (let i = 0; i < WORD_LENGTH; i += 1) {
        mutableSlots[i] = snapshot.slots[i] ?? null;
      }
      syncSlots();
      state.cursorPosition = clampCursor(snapshot.cursorPosition);
      state.message = snapshot.message;
    },
    submitGuess() {
      return submitGuessDetailed().ok;
    },
    submitGuessDetailed,
    setHardMode(enabled: boolean) {
      state.hardMode = Boolean(enabled);
    },
    undoLatestGuess(): UndoGuessResult {
      if (state.guesses.length === 0) {
        return { ok: false, reason: 'empty' };
      }

      state.guesses.pop();
      state.evaluations.pop();
      state.keyState = rebuildKeyState(state.guesses, state.evaluations);
      state.status = 'playing';
      clearEditableRow();

      if (state.guesses.length === 0) {
        state.message = state.mode === 'practice'
          ? strings.practiceLoaded(words.size)
          : strings.dailyLoaded(words.size);
      } else {
        state.message = guessRegisteredMessage(state.guesses.length);
      }
      return { ok: true };
    },
    reset(nextAnswer: string | WordEntry, options: { hardMode?: boolean; mode?: PuzzleMode; maxGuesses?: number } = {}) {
      const nextAnswerEntry = toAnswerEntry(nextAnswer);
      if (!words.has(nextAnswerEntry.key)) {
        throw new Error(`answer ${nextAnswerEntry.key} is not in dictionary`);
      }
      if (options.mode === 'practice' || options.mode === 'daily') {
        state.mode = options.mode;
      }
      if (options.hardMode !== undefined) {
        state.hardMode = Boolean(options.hardMode);
      }
      if (options.maxGuesses !== undefined || options.mode !== undefined) {
        state.maxGuesses = resolveMaxGuesses(state.mode, options.maxGuesses ?? state.maxGuesses);
      }
      state.answer = nextAnswerEntry.text;
      state.answerKey = nextAnswerEntry.key;
      state.guesses = [];
      state.evaluations = [];
      clearEditableRow();
      state.status = 'playing';
      state.message = state.mode === 'practice' ? strings.practiceLoaded(words.size) : strings.gameReset;
      state.keyState.clear();
    },
    switchLanguage(config: GameConfig) {
      const { answer, dictionary, language } = config;
      assertLanguage(language);
      const nextWords = createWordLookup(dictionary);
      const nextAnswer = toAnswerEntry(answer);
      if (!nextWords.has(nextAnswer.key)) {
        throw new Error(`answer ${nextAnswer.key} is not in dictionary`);
      }
      words = nextWords;
      strings = messages[language];
      state.answer = nextAnswer.text;
      state.answerKey = nextAnswer.key;
      state.guesses = [];
      state.evaluations = [];
      clearEditableRow();
      state.status = 'playing';
      state.hardMode = config.hardMode !== undefined ? Boolean(config.hardMode) : state.hardMode;
      state.mode = config.mode === 'practice' ? 'practice' : 'daily';
      state.maxGuesses = resolveMaxGuesses(state.mode, config.maxGuesses);
      state.message = state.mode === 'practice'
        ? strings.practiceLoaded(nextWords.size)
        : strings.gameReset;
      state.keyState.clear();
      state.language = language;
    },
  };
}
