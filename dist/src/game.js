"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TILE = exports.MAX_GUESSES = exports.WORD_LENGTH = void 0;
exports.normalizeWord = normalizeWord;
exports.evaluateGuess = evaluateGuess;
exports.createGame = createGame;
const i18n_1 = require("./i18n");
exports.WORD_LENGTH = 5;
exports.MAX_GUESSES = 6;
exports.TILE = {
    EMPTY: 'empty',
    ABSENT: 'absent',
    PRESENT: 'present',
    CORRECT: 'correct',
};
function normalizeWord(word) {
    return word
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
function evaluateGuess(guess, answer) {
    const guessKey = normalizeWord(guess);
    const answerKey = normalizeWord(answer);
    if (guessKey.length !== exports.WORD_LENGTH || answerKey.length !== exports.WORD_LENGTH) {
        throw new Error('guess and answer must be 5 letters');
    }
    const result = new Array(exports.WORD_LENGTH).fill(exports.TILE.ABSENT);
    const answerChars = answerKey.split('');
    const remaining = new Map();
    for (let i = 0; i < exports.WORD_LENGTH; i += 1) {
        if (guessKey[i] === answerChars[i]) {
            result[i] = exports.TILE.CORRECT;
            answerChars[i] = null;
        }
    }
    for (const ch of answerChars) {
        if (!ch)
            continue;
        remaining.set(ch, (remaining.get(ch) || 0) + 1);
    }
    for (let i = 0; i < exports.WORD_LENGTH; i += 1) {
        if (result[i] === exports.TILE.CORRECT)
            continue;
        const count = remaining.get(guessKey[i]) || 0;
        if (count > 0) {
            result[i] = exports.TILE.PRESENT;
            remaining.set(guessKey[i], count - 1);
        }
    }
    return result;
}
function createWordLookup(words) {
    const dictionary = new Map();
    if (Array.isArray(words)) {
        for (const word of words) {
            const key = normalizeWord(word);
            if (!dictionary.has(key))
                dictionary.set(key, word.toLowerCase());
        }
    }
    else if (words instanceof Set) {
        for (const word of words) {
            const key = normalizeWord(word);
            if (!dictionary.has(key))
                dictionary.set(key, word.toLowerCase());
        }
    }
    else {
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
function toAnswerEntry(answer) {
    if (typeof answer === 'string') {
        return { key: normalizeWord(answer), text: answer.toLowerCase() };
    }
    return {
        key: normalizeWord(answer.key),
        text: answer.text.toLowerCase(),
    };
}
function assertLanguage(lang) {
    if (!(lang === 'en' || lang === 'pt')) {
        throw new Error(`Unsupported language: ${lang}`);
    }
}
function createGame(config) {
    assertLanguage(config.language);
    return buildGame(config);
}
function buildGame(config) {
    const { answer, dictionary, language } = config;
    let strings = i18n_1.messages[language];
    let words = createWordLookup(dictionary);
    const answerEntry = toAnswerEntry(answer);
    if (!words.has(answerEntry.key)) {
        throw new Error(`answer ${answerEntry.key} is not in dictionary`);
    }
    const state = {
        answer: answerEntry.text,
        answerKey: answerEntry.key,
        guesses: [],
        evaluations: [],
        currentGuess: '',
        cursorPosition: 0,
        status: 'playing',
        message: strings.dailyLoaded(words.size),
        keyState: new Map(),
        language,
    };
    function updateKeyboard(guess, evals) {
        const rank = { [exports.TILE.EMPTY]: 0, [exports.TILE.ABSENT]: 1, [exports.TILE.PRESENT]: 2, [exports.TILE.CORRECT]: 3 };
        for (let i = 0; i < guess.length; i += 1) {
            const ch = guess[i];
            const score = evals[i];
            const prev = state.keyState.get(ch) || exports.TILE.EMPTY;
            if (rank[score] > rank[prev])
                state.keyState.set(ch, score);
        }
    }
    function clampCursor(position) {
        return Math.max(0, Math.min(position, state.currentGuess.length));
    }
    return {
        state,
        addLetter(ch) {
            if (state.status !== 'playing')
                return;
            const letter = normalizeWord(ch);
            if (!/^[a-z]$/.test(letter))
                return;
            if (state.currentGuess.length >= exports.WORD_LENGTH && state.cursorPosition >= exports.WORD_LENGTH)
                return;
            const chars = Array.from(state.currentGuess);
            if (state.cursorPosition < chars.length) {
                chars[state.cursorPosition] = letter;
            }
            else {
                chars.push(letter);
            }
            state.currentGuess = chars.join('');
            state.cursorPosition = Math.min(state.cursorPosition + 1, exports.WORD_LENGTH);
            state.message = '';
        },
        backspace() {
            if (state.status !== 'playing')
                return;
            if (state.cursorPosition === 0)
                return;
            const chars = Array.from(state.currentGuess);
            chars.splice(state.cursorPosition - 1, 1);
            state.currentGuess = chars.join('');
            state.cursorPosition = clampCursor(state.cursorPosition - 1);
        },
        moveCursor(offset) {
            if (state.status !== 'playing')
                return;
            state.cursorPosition = clampCursor(state.cursorPosition + offset);
        },
        setCursorPosition(position) {
            if (state.status !== 'playing')
                return;
            state.cursorPosition = clampCursor(position);
        },
        submitGuess() {
            if (state.status !== 'playing')
                return false;
            if (state.currentGuess.length !== exports.WORD_LENGTH) {
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
            }
            else if (state.guesses.length >= exports.MAX_GUESSES) {
                state.status = 'lost';
                state.message = strings.loseMessage(state.answer);
            }
            else {
                state.message = strings.guessRegistered(state.guesses.length);
            }
            state.currentGuess = '';
            state.cursorPosition = 0;
            return true;
        },
        reset(nextAnswer) {
            const nextAnswerEntry = toAnswerEntry(nextAnswer);
            if (!words.has(nextAnswerEntry.key)) {
                throw new Error(`answer ${nextAnswerEntry.key} is not in dictionary`);
            }
            state.answer = nextAnswerEntry.text;
            state.answerKey = nextAnswerEntry.key;
            state.guesses = [];
            state.evaluations = [];
            state.currentGuess = '';
            state.cursorPosition = 0;
            state.status = 'playing';
            state.message = strings.gameReset;
            state.keyState.clear();
        },
        switchLanguage(config) {
            const { answer, dictionary, language } = config;
            assertLanguage(language);
            const nextWords = createWordLookup(dictionary);
            const nextAnswer = toAnswerEntry(answer);
            if (!nextWords.has(nextAnswer.key)) {
                throw new Error(`answer ${nextAnswer.key} is not in dictionary`);
            }
            words = nextWords;
            strings = i18n_1.messages[language];
            state.answer = nextAnswer.text;
            state.answerKey = nextAnswer.key;
            state.guesses = [];
            state.evaluations = [];
            state.currentGuess = '';
            state.cursorPosition = 0;
            state.status = 'playing';
            state.message = strings.gameReset;
            state.keyState.clear();
            state.language = language;
        },
    };
}
