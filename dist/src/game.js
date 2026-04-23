"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TILE = exports.MAX_GUESSES = exports.WORD_LENGTH = void 0;
exports.evaluateGuess = evaluateGuess;
exports.createGame = createGame;
exports.WORD_LENGTH = 5;
exports.MAX_GUESSES = 6;
exports.TILE = {
    EMPTY: 'empty',
    ABSENT: 'absent',
    PRESENT: 'present',
    CORRECT: 'correct',
};
function evaluateGuess(guess, answer) {
    if (guess.length !== exports.WORD_LENGTH || answer.length !== exports.WORD_LENGTH) {
        throw new Error('guess and answer must be 5 letters');
    }
    const result = new Array(exports.WORD_LENGTH).fill(exports.TILE.ABSENT);
    const answerChars = answer.split('');
    const remaining = new Map();
    for (let i = 0; i < exports.WORD_LENGTH; i += 1) {
        if (guess[i] === answerChars[i]) {
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
        const count = remaining.get(guess[i]) || 0;
        if (count > 0) {
            result[i] = exports.TILE.PRESENT;
            remaining.set(guess[i], count - 1);
        }
    }
    return result;
}
function createGame(answer, validWords) {
    const dictionary = new Set(validWords.map((w) => w.toLowerCase()));
    const state = {
        answer: answer.toLowerCase(),
        guesses: [],
        evaluations: [],
        currentGuess: '',
        status: 'playing',
        message: 'Type a 5-letter word. Enter to submit.',
        keyState: new Map(),
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
    return {
        state,
        addLetter(ch) {
            if (state.status !== 'playing')
                return;
            if (!/^[a-z]$/.test(ch))
                return;
            if (state.currentGuess.length >= exports.WORD_LENGTH)
                return;
            state.currentGuess += ch;
            state.message = '';
        },
        backspace() {
            if (state.status !== 'playing')
                return;
            state.currentGuess = state.currentGuess.slice(0, -1);
        },
        submitGuess() {
            if (state.status !== 'playing')
                return false;
            if (state.currentGuess.length !== exports.WORD_LENGTH) {
                state.message = 'Not enough letters.';
                return false;
            }
            if (!dictionary.has(state.currentGuess)) {
                state.message = 'Word not in list.';
                return false;
            }
            const evals = evaluateGuess(state.currentGuess, state.answer);
            state.guesses.push(state.currentGuess);
            state.evaluations.push(evals);
            updateKeyboard(state.currentGuess, evals);
            if (state.currentGuess === state.answer) {
                state.status = 'won';
                state.message = `You solved it in ${state.guesses.length}/6! Press r to play again or q to quit.`;
            }
            else if (state.guesses.length >= exports.MAX_GUESSES) {
                state.status = 'lost';
                state.message = `Out of guesses. The word was ${state.answer.toUpperCase()}. Press r to play again or q to quit.`;
            }
            else {
                state.message = `Guess ${state.guesses.length}/6 recorded.`;
            }
            state.currentGuess = '';
            return true;
        },
        reset(nextAnswer) {
            state.answer = nextAnswer.toLowerCase();
            state.guesses = [];
            state.evaluations = [];
            state.currentGuess = '';
            state.status = 'playing';
            state.message = 'New game. Type a 5-letter word.';
            state.keyState.clear();
        },
    };
}
