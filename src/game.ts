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

export interface GameState {
  answer: string;
  guesses: string[];
  evaluations: TileState[][];
  currentGuess: string;
  status: GameStatus;
  message: string;
  keyState: Map<string, TileState>;
}

export function evaluateGuess(guess: string, answer: string): TileState[] {
  if (guess.length !== WORD_LENGTH || answer.length !== WORD_LENGTH) {
    throw new Error('guess and answer must be 5 letters');
  }

  const result: TileState[] = new Array(WORD_LENGTH).fill(TILE.ABSENT);
  const answerChars: Array<string | null> = answer.split('');
  const remaining = new Map<string, number>();

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guess[i] === answerChars[i]) {
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
    const count = remaining.get(guess[i]) || 0;
    if (count > 0) {
      result[i] = TILE.PRESENT;
      remaining.set(guess[i], count - 1);
    }
  }

  return result;
}

export function createGame(answer: string, validWords: string[]) {
  const dictionary = new Set(validWords.map((w) => w.toLowerCase()));
  const state: GameState = {
    answer: answer.toLowerCase(),
    guesses: [],
    evaluations: [],
    currentGuess: '',
    status: 'playing',
    message: 'Type a 5-letter word. Enter to submit.',
    keyState: new Map(),
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
      if (!/^[a-z]$/.test(ch)) return;
      if (state.currentGuess.length >= WORD_LENGTH) return;
      state.currentGuess += ch;
      state.message = '';
    },
    backspace() {
      if (state.status !== 'playing') return;
      state.currentGuess = state.currentGuess.slice(0, -1);
    },
    submitGuess() {
      if (state.status !== 'playing') return false;
      if (state.currentGuess.length !== WORD_LENGTH) {
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
      } else if (state.guesses.length >= MAX_GUESSES) {
        state.status = 'lost';
        state.message = `Out of guesses. The word was ${state.answer.toUpperCase()}. Press r to play again or q to quit.`;
      } else {
        state.message = `Guess ${state.guesses.length}/6 recorded.`;
      }

      state.currentGuess = '';
      return true;
    },
    reset(nextAnswer: string) {
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
