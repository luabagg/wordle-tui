import { describe, expect, test } from 'bun:test';
import { createWordleApp } from '../src/app';
import type { WordBank } from '../src/dictionary';
import { createGame, evaluateGuess, TILE } from '../src/game';
import { getSessionTips, type GameSession } from '../src/mcp';
import {
  rankGuessesAsync,
  selectTips,
  selectTipsAsync,
  tipsHistoryFingerprint,
} from '../src/tips';
import { defaultStats } from '../src/stats';

const answerKeys = ['crane', 'slate', 'trace', 'react'];
const allWords = {
  crane: 'crane',
  slate: 'slate',
  trace: 'trace',
  react: 'react',
  adieu: 'adieu',
  roate: 'roate',
};

function bank(language: 'en' | 'pt', keys = answerKeys): WordBank {
  return {
    language,
    allWords: Object.fromEntries(keys.map((key) => [key, key])),
    answers: keys.map((key) => ({ key, text: key })),
  };
}

function base26Word(index: number): string {
  let value = index;
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }
  return `a${suffix}`;
}

function largeBanks(count = 201): Record<'en' | 'pt', WordBank> {
  const keys = Array.from({ length: count }, (_, index) => base26Word(index));
  return { en: bank('en', keys), pt: bank('pt', keys) };
}

describe('shared tips selector', () => {
  test('uses the candidate-first pool and accepted-word fallback', () => {
    const history = [{ guess: 'slate', evaluation: evaluateGuess('slate', 'crane') }];
    const remaining = selectTips({ language: 'en', history, answerKeys, allWords });

    expect(remaining.candidates).toContain('crane');
    expect(remaining.ranked).toHaveLength(answerKeys.length);
    expect(remaining.ranked.every((score) => answerKeys.includes(score.guess))).toBe(true);

    const impossible = selectTips({
      language: 'en',
      history: [{
        guess: 'zzzzz',
        evaluation: [TILE.CORRECT, TILE.CORRECT, TILE.CORRECT, TILE.CORRECT, TILE.CORRECT],
      }],
      answerKeys,
      allWords,
    });
    expect(impossible.candidates).toEqual([]);
    expect(impossible.ranked).toHaveLength(Object.keys(allWords).length);
  });

  test('sync and cooperative async selectors have identical count, best, and ranking', async () => {
    const history = [{ guess: 'slate', evaluation: evaluateGuess('slate', 'crane') }];
    const args = { language: 'en' as const, history, answerKeys, allWords };
    const sync = selectTips(args);
    const asyncResult = await selectTipsAsync(args, {
      chunkSize: 1,
      yieldFn: async () => {},
    });

    expect(asyncResult.candidates.length).toBe(sync.candidates.length);
    expect(asyncResult.bestCandidate).toBe(sync.bestCandidate);
    expect(asyncResult.ranked).toEqual(sync.ranked);
  });

  test('TUI selector and MCP adapter return identical count, best, and ranking', () => {
    const enBank: WordBank = {
      language: 'en',
      allWords,
      answers: answerKeys.map((key) => ({ key, text: key })),
    };
    const session: GameSession = {
      game: createGame({ answer: 'crane', dictionary: allWords, language: 'en' }),
      enBank,
      ptBank: bank('pt'),
    };
    session.game.setCurrentGuess('slate');
    expect(session.game.submitGuess()).toBe(true);

    const history = session.game.state.guesses.map((guess, index) => ({
      guess,
      evaluation: session.game.state.evaluations[index],
    }));
    const direct = selectTips({ language: 'en', history, answerKeys, allWords });
    const mcp = getSessionTips(session);

    expect(mcp.candidatesRemaining).toBe(direct.candidates.length);
    expect(mcp.bestCandidate).toBe(direct.bestCandidate);
    expect(mcp.ranked).toEqual(direct.ranked);
    expect(mcp.decisionPath).toEqual(direct.path);
    expect(mcp.nextQuestion).toEqual(direct.plan);
  });

  test('hard mode suggests only words that keep every revealed hint', () => {
    const history = [{ guess: 'slate', evaluation: evaluateGuess('slate', 'crane') }];
    const normal = selectTips({ language: 'en', history, answerKeys, allWords });
    const hard = selectTips({ language: 'en', history, answerKeys, allWords, hardMode: true });

    expect(normal.ranked.some((score) => !normal.candidates.includes(score.guess))).toBe(true);
    expect(hard.ranked.map((score) => score.guess).sort()).toEqual([...hard.candidates].sort());
    expect(hard.cacheKey).not.toBe(normal.cacheKey);
  });

  test('ready tips carry the decision path and the plan for the top guess', () => {
    const history = [{ guess: 'slate', evaluation: evaluateGuess('slate', 'crane') }];
    const tips = selectTips({ language: 'en', history, answerKeys, allWords });

    expect(tips.path).toHaveLength(1);
    expect(tips.path[0].candidatesBefore).toBe(answerKeys.length);
    expect(tips.path[0].candidatesAfter).toBe(tips.candidates.length);
    expect(tips.uncertaintyBits).toBeCloseTo(Math.log2(tips.candidates.length), 10);
    expect(tips.plan?.split.guess).toBe(tips.ranked[0].guess);
    expect(tips.plan?.split.candidates).toBe(tips.candidates.length);
  });

  test('history fingerprint includes language, guesses, and evaluation pattern', () => {
    const history = [{ guess: 'slate', evaluation: evaluateGuess('slate', 'crane') }];
    expect(tipsHistoryFingerprint('en', history)).not.toBe(tipsHistoryFingerprint('pt', history));
    expect(tipsHistoryFingerprint('en', history)).not.toBe(tipsHistoryFingerprint('en', [{
      guess: 'slate',
      evaluation: [TILE.ABSENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT],
    }]));
  });

  test('cooperative ranking can be aborted between chunks', async () => {
    const controller = new AbortController();
    let yields = 0;
    const promise = rankGuessesAsync(answerKeys, answerKeys, {
      chunkSize: 1,
      signal: controller.signal,
      yieldFn: async () => {
        yields += 1;
        controller.abort();
      },
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(yields).toBe(1);
  });

  test('aborts immediately before finalization with thousands of candidates', async () => {
    const keys = Array.from({ length: 2_001 }, (_, index) => base26Word(index));
    const controller = new AbortController();
    let sawFinalPrimaryChunk = false;
    const promise = selectTipsAsync({
      language: 'en',
      history: [],
      answerKeys: keys,
      allWords: Object.fromEntries(keys.map((key) => [key, key])),
    }, {
      chunkSize: 128,
      signal: controller.signal,
      onPartial: (ranked) => {
        if (ranked.length === keys.length) {
          sawFinalPrimaryChunk = true;
          controller.abort();
        }
      },
      yieldFn: () => Bun.sleep(0),
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(sawFinalPrimaryChunk).toBe(true);
  }, 15_000);
});

describe('TUI tips memoization and responsiveness', () => {
  test('shows immediate computing feedback, allows back, and memoizes completed history', async () => {
    const banks = largeBanks();
    const stats = defaultStats();
    stats.introSeen = true;
    let clock = new Date('2026-07-16T12:00:00Z');
    const app = createWordleApp({
      language: 'en',
      banks,
      stats,
      effects: {
        now: () => clock,
        saveStats: () => {},
        copyText: () => false,
      },
    });

    const started = performance.now();
    app.dispatch({ type: 'openTips' });
    const immediate = app.snapshot().tips;
    expect(performance.now() - started).toBeLessThan(500);
    expect(immediate?.status).toBe('computing');
    expect(immediate?.candidates).toHaveLength(201);

    app.dispatch({ type: 'backToGame' });
    expect(app.snapshot().view).toBe('game');
    await Bun.sleep(0);

    app.dispatch({ type: 'openTips' });
    await app.flushTips();
    const ready = app.getTips();
    expect(ready.status).toBe('ready');
    expect(app.getTips()).toBe(ready);

    app.dispatch({ type: 'backToGame' });
    app.getGame().setCurrentGuess(base26Word(1));
    app.dispatch({ type: 'submit' });
    const afterSubmit = app.getTips();
    expect(afterSubmit.cacheKey).not.toBe(ready.cacheKey);

    app.dispatch({ type: 'restart' });
    app.dispatch({ type: 'confirmRestart' });
    const afterRestart = app.getTips();
    expect(afterRestart).not.toBe(ready);
    expect(afterRestart.cacheKey).toBe('en|normal|');

    app.dispatch({ type: 'switchLanguage' });
    const beforeRollover = app.getTips();
    expect(beforeRollover.cacheKey).toBe('pt|normal|');

    clock = new Date('2026-07-17T04:00:00Z');
    app.onTick(clock);
    const afterRollover = app.getTips();
    expect(afterRollover.cacheKey).toBe('pt|normal|');
    expect(afterRollover).not.toBe(beforeRollover);
    app.dispatch({ type: 'quit' });
  }, 10_000);
});
