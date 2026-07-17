import { describe, expect, test } from 'bun:test';
import {
  applyStartGame,
  applySubmitGuess,
  applySwitchLanguage,
  buildGameStateResponse,
  createSession,
} from '../src/mcp';
import type { GameSession } from '../src/mcp';
import { createGame } from '../src/game';
import type { WordBank } from '../src/dictionary';

const enBank: WordBank = {
  language: 'en',
  allWords: { crane: 'crane', slate: 'slate', trace: 'trace' },
  answers: [{ key: 'crane', text: 'crane' }],
};
const ptBank: WordBank = {
  language: 'pt',
  allWords: { sabio: 'sábio', termo: 'termo', texto: 'texto' },
  answers: [{ key: 'sabio', text: 'sábio' }],
};

function makeSession(language: 'en' | 'pt' = 'en'): GameSession {
  const bank = language === 'en' ? enBank : ptBank;
  const answer = bank.answers[0];
  return {
    game: createGame({ answer, dictionary: bank.allWords, language }),
    enBank,
    ptBank,
  };
}

function stateFingerprint(session: GameSession) {
  const state = session.game.state;
  return {
    language: state.language,
    answerKey: state.answerKey,
    guesses: [...state.guesses],
    evaluations: state.evaluations.map((row) => [...row]),
    slots: [...state.slots],
    cursorPosition: state.cursorPosition,
    status: state.status,
    message: state.message,
    keyState: [...state.keyState],
  };
}

describe('MCP game adapters', () => {
  test('buildGameStateResponse returns serializable state and sparse current cells', () => {
    const session = makeSession();
    session.game.setCursorPosition(3);
    session.game.addLetter('a');

    const state = buildGameStateResponse(session.game);
    expect(state.status).toBe('playing');
    expect(state.grid).toHaveLength(6);
    expect(state.language).toBe('en');
    expect(Array.isArray(state.keyboard)).toBe(true);
    expect(state.grid[0].map((cell) => cell.letter)).toEqual([' ', ' ', ' ', 'A', ' ']);
  });

  test('createSession starts English and Portuguese games', async () => {
    const english = await createSession('en');
    expect(english.game.state.language).toBe('en');
    expect(english.game.state.status).toBe('playing');
    expect(english.enBank.language).toBe('en');
    expect(english.ptBank.language).toBe('pt');

    const portuguese = await createSession('pt');
    expect(portuguese.game.state.language).toBe('pt');
  });

  test('submit_guess replaces a partial row and submits the exact tool word', () => {
    const session = makeSession();
    session.game.setCursorPosition(2);
    session.game.addLetter('x');

    const result = applySubmitGuess(session, 'slate');
    expect(result.ok).toBe(true);
    expect(session.game.state.guesses).toEqual(['slate']);
    expect(session.game.state.slots).toEqual([null, null, null, null, null]);
  });

  test('submit_guess accepts accented Portuguese input', () => {
    const session = makeSession('pt');
    const result = applySubmitGuess(session, 'sábio');

    expect(result.ok).toBe(true);
    expect(session.game.state.guesses).toEqual(['sábio']);
    expect(session.game.state.status).toBe('won');
  });

  test('invalid submit_guess inputs return structured errors without mutation', () => {
    const session = makeSession();
    session.game.setCursorPosition(2);
    session.game.addLetter('a');

    for (const [guess, code] of [
      ['four', 'invalid_length'],
      ['toolong', 'invalid_length'],
      ['ab3de', 'invalid_chars'],
      [null, 'invalid_chars'],
    ] as const) {
      const before = stateFingerprint(session);
      const result = applySubmitGuess(session, guess);
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(stateFingerprint(session)).toEqual(before);
      if (guess === 'ab3de') {
        expect(result).toMatchObject({ error: { message: 'Use letters only (A–Z).' } });
      }
    }
  });

  test('dictionary misses are structured and restore the previous sparse row', () => {
    const session = makeSession();
    session.game.setCursorPosition(3);
    session.game.addLetter('x');
    const before = stateFingerprint(session);

    const result = applySubmitGuess(session, 'zzzzz');
    expect(result).toMatchObject({ ok: false, error: { code: 'not_in_dictionary' } });
    expect(stateFingerprint(session)).toEqual(before);
  });

  test('finished sessions reject submit_guess without mutation', () => {
    const won = makeSession();
    expect(applySubmitGuess(won, 'crane').ok).toBe(true);
    const wonBefore = stateFingerprint(won);
    expect(applySubmitGuess(won, 'slate')).toMatchObject({
      ok: false,
      error: { code: 'game_over' },
    });
    expect(stateFingerprint(won)).toEqual(wonBefore);

    const lost = makeSession();
    for (let i = 0; i < 6; i += 1) expect(applySubmitGuess(lost, 'slate').ok).toBe(true);
    const lostBefore = stateFingerprint(lost);
    expect(applySubmitGuess(lost, 'trace')).toMatchObject({
      ok: false,
      error: { code: 'game_over' },
    });
    expect(stateFingerprint(lost)).toEqual(lostBefore);
  });

  test('invalid switch/start languages return structured errors without changing the session', async () => {
    const session = makeSession();
    const before = stateFingerprint(session);

    expect(applySwitchLanguage(session, 'fr')).toMatchObject({
      ok: false,
      error: { code: 'invalid_language' },
    });
    expect(stateFingerprint(session)).toEqual(before);

    await expect(applyStartGame('fr')).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_language' },
    });
    expect(stateFingerprint(session)).toEqual(before);
  });
});
