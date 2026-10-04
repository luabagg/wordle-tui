import { describe, expect, test } from 'bun:test';
import { createWordleApp, parseLanguage } from '../src/app';
import type { WordBank } from '../src/dictionary';
import { messages } from '../src/i18n';
import { defaultStats, type GameStats } from '../src/stats';
import { TILE } from '../src/game';
import { dailyDescriptor } from '../src/words';

const banks: Record<'en' | 'pt', WordBank> = {
  en: {
    language: 'en',
    allWords: {
      crane: 'crane',
      slate: 'slate',
      trace: 'trace',
      laser: 'laser',
      point: 'point',
    },
    answers: [{ key: 'crane', text: 'crane' }],
  },
  pt: {
    language: 'pt',
    allWords: { termo: 'termo', texto: 'texto', sabio: 'sábio' },
    answers: [{ key: 'termo', text: 'termo' }],
  },
};

function createTestApp(options: {
  introSeen?: boolean;
  language?: 'en' | 'pt';
  stats?: GameStats;
  copyText?: (text: string) => boolean;
  persistenceWarning?: string | null;
  now?: Date;
} = {}) {
  let clock = options.now ?? new Date('2026-07-16T12:00:00Z');
  const stats = options.stats ?? defaultStats();
  if (options.stats == null) stats.introSeen = options.introSeen ?? true;
  const saves: GameStats[] = [];
  const copies: string[] = [];
  const app = createWordleApp({
    language: options.language ?? 'en',
    banks,
    stats,
    persistenceWarning: options.persistenceWarning,
    effects: {
      now: () => clock,
      saveStats: (value) => saves.push(structuredClone(value)),
      copyText: (text) => {
        copies.push(text);
        return options.copyText?.(text) ?? true;
      },
    },
  });
  return {
    app,
    stats,
    saves,
    copies,
    setNow: (value: Date) => { clock = value; },
    getNow: () => clock,
  };
}

function typeWord(app: ReturnType<typeof createWordleApp>, word: string): void {
  for (const char of word) app.dispatch({ type: 'type', char });
}

describe('parseLanguage', () => {
  test('accepts short and inline language flags', () => {
    expect(parseLanguage(['-l', 'en'])).toBe('en');
    expect(parseLanguage(['--lang=pt'])).toBe('pt');
    expect(parseLanguage(['--lang', 'EN'])).toBe('en');
  });

  test('falls back to Portuguese for missing or unsupported values', () => {
    expect(parseLanguage([])).toBe('pt');
    expect(parseLanguage(['--lang', 'fr'])).toBe('pt');
  });
});

describe('WordleApp controller', () => {
  test('starts on intro help and persists dismissal once', () => {
    const { app, saves } = createTestApp({ introSeen: false });
    expect(app.snapshot().view).toBe('help');
    expect(app.snapshot().introPending).toBe(true);

    app.dispatch({ type: 'dismissIntro' });
    expect(app.snapshot().view).toBe('game');
    expect(app.snapshot().introPending).toBe(false);
    expect(app.snapshot().stats.introSeen).toBe(true);
    expect(saves.length).toBeGreaterThanOrEqual(1);
    const afterFirst = saves.length;

    app.dispatch({ type: 'dismissIntro' });
    expect(saves).toHaveLength(afterFirst);
  });

  test('switches between help, progress, tips, and game views', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'openHelp' });
    expect(app.snapshot().view).toBe('help');
    app.dispatch({ type: 'backToGame' });
    app.dispatch({ type: 'openProgress' });
    expect(app.snapshot().view).toBe('progress');
    app.dispatch({ type: 'backToGame' });
    app.dispatch({ type: 'openTips' });
    expect(app.snapshot().view).toBe('tips');
    expect(app.snapshot().tips?.candidates).toContain('crane');
    app.dispatch({ type: 'backToGame' });
    expect(app.snapshot().view).toBe('game');
  });

  test('finished games restart immediately without confirmation', () => {
    const { app } = createTestApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.status).toBe('won');

    app.dispatch({ type: 'restart' });
    expect(app.snapshot().view).toBe('game');
    expect(app.snapshot().restartConfirmPending).toBe(false);
    expect(app.snapshot().game.slots).toEqual([null, null, null, null, null]);
    expect(app.snapshot().game.answerKey).toBe('crane');
    expect(app.snapshot().game.status).toBe('playing');
    expect(app.snapshot().stats.activeByLanguage.en).toBeUndefined();
  });

  test('unfinished progress requires restart confirmation', () => {
    const { app } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'restart' });
    expect(app.snapshot().view).toBe('confirmRestart');
    expect(app.snapshot().restartConfirmPending).toBe(true);
    expect(app.snapshot().game.slots).toEqual(['s', 'l', 'a', 't', 'e']);

    app.dispatch({ type: 'cancelRestart' });
    expect(app.snapshot().view).toBe('game');
    expect(app.snapshot().game.slots).toEqual(['s', 'l', 'a', 't', 'e']);

    app.dispatch({ type: 'restart' });
    app.dispatch({ type: 'confirmRestart' });
    expect(app.snapshot().view).toBe('game');
    expect(app.snapshot().game.slots).toEqual([null, null, null, null, null]);
    expect(app.snapshot().game.answerKey).toBe('crane');
  });

  test('Y/N keys confirm or cancel restart', () => {
    const { app } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'restart' });
    app.dispatch({ type: 'type', char: 'n' });
    expect(app.snapshot().game.slots).toEqual(['s', 'l', 'a', 't', 'e']);

    app.dispatch({ type: 'restart' });
    app.dispatch({ type: 'type', char: 'y' });
    expect(app.snapshot().game.slots).toEqual([null, null, null, null, null]);
  });

  test('switches language while preserving independent sessions', () => {
    const { app, stats } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.guesses).toEqual(['slate']);

    app.dispatch({ type: 'switchLanguage' });
    let snapshot = app.snapshot();
    expect(snapshot.language).toBe('pt');
    expect(snapshot.game.language).toBe('pt');
    expect(snapshot.game.answerKey).toBe('termo');
    expect(snapshot.game.guesses).toEqual([]);
    expect(snapshot.game.slots).toEqual([null, null, null, null, null]);
    expect(stats.activeByLanguage.en?.guesses).toEqual(['slate']);

    typeWord(app, 'texto');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'switchLanguage' });
    snapshot = app.snapshot();
    expect(snapshot.language).toBe('en');
    expect(snapshot.game.guesses).toEqual(['slate']);
    expect(snapshot.game.slots).toEqual([null, null, null, null, null]);
    expect(stats.activeByLanguage.pt?.guesses).toEqual(['texto']);
  });

  test('derives tips from submitted guess history without mutating the game', () => {
    const { app } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    const guessesBefore = [...app.snapshot().game.guesses];

    app.dispatch({ type: 'openTips' });
    const tips = app.snapshot().tips;

    expect(tips).not.toBeNull();
    expect(tips?.ranked.length).toBeGreaterThan(0);
    expect(app.snapshot().game.guesses).toEqual(guessesBefore);
  });

  test('records and saves a completed daily result exactly once', () => {
    const { app, stats, getNow } = createTestApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });

    expect(app.snapshot().game.status).toBe('won');
    expect(app.snapshot().stats.gamesPlayed).toBe(1);
    const playedAfterWin = stats.gamesPlayed;

    app.dispatch({ type: 'submit' });
    expect(app.snapshot().stats.gamesPlayed).toBe(playedAfterWin);
    expect(stats.results[dailyDescriptor('en', getNow()).id]?.won).toBe(true);
  });

  test('shares the finished result through the injected clipboard effect', () => {
    const { app, copies } = createTestApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'share' });

    const snapshot = app.snapshot();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toContain('Wordle');
    expect(snapshot.shareCopied).toBe(true);
    expect(snapshot.shareCopySucceeded).toBe(true);
    expect(snapshot.shareText).toContain('🟩🟩🟩🟩🟩');
  });

  test('reveals share text when clipboard copying fails', () => {
    const { app } = createTestApp({ copyText: () => false });
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'share' });

    expect(app.snapshot().shareCopied).toBe(true);
    expect(app.snapshot().shareCopySucceeded).toBe(false);
    expect(app.snapshot().shareText).not.toBeNull();
  });

  test('returns an explicit quit result without mutating game state', () => {
    const { app } = createTestApp();
    const before = [...app.snapshot().game.slots];
    expect(app.dispatch({ type: 'quit' })).toEqual({ shouldQuit: true });
    expect([...app.snapshot().game.slots]).toEqual(before);
  });

  test('paste fills exactly five slots without auto-submitting', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'paste', text: 'slate' });

    expect(app.snapshot().game.slots).toEqual(['s', 'l', 'a', 't', 'e']);
    expect(app.snapshot().game.cursorPosition).toBe(5);
    expect(app.snapshot().game.guesses).toEqual([]);
    expect(app.snapshot().game.status).toBe('playing');
  });

  test('paste normalizes accented Portuguese words', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'switchLanguage' });
    app.dispatch({ type: 'paste', text: 'sábio' });

    expect(app.snapshot().game.slots).toEqual(['s', 'a', 'b', 'i', 'o']);
    expect(app.snapshot().game.guesses).toEqual([]);
  });

  test('invalid paste is atomic and reports a localized status', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'setCursor', position: 2 });
    app.dispatch({ type: 'type', char: 'a' });
    const slotsBefore = [...app.snapshot().game.slots];
    const cursorBefore = app.snapshot().game.cursorPosition;

    for (const text of ['', 'toolong', 'ab3de', 'two\nlines', ' slate']) {
      app.dispatch({ type: 'paste', text });
      expect([...app.snapshot().game.slots]).toEqual(slotsBefore);
      expect(app.snapshot().game.cursorPosition).toBe(cursorBefore);
      expect(app.snapshot().game.message).toBe('Paste exactly one 5-letter word.');
    }
  });

  test('paste is ignored outside an active game view and after completion', () => {
    const { app } = createTestApp();
    const before = [...app.snapshot().game.slots];
    for (const action of [
      { type: 'openHelp' as const },
      { type: 'openProgress' as const },
      { type: 'openTips' as const },
    ]) {
      app.dispatch(action);
      app.dispatch({ type: 'paste', text: 'slate' });
      expect([...app.snapshot().game.slots]).toEqual(before);
      app.dispatch({ type: 'backToGame' });
    }

    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    const finishedBefore = [...app.snapshot().game.slots];
    app.dispatch({ type: 'paste', text: 'slate' });
    expect([...app.snapshot().game.slots]).toEqual(finishedBefore);
    expect(app.snapshot().game.guesses).toEqual(['crane']);
  });
});

describe('active session persistence', () => {
  test('restores partial in-progress board for the same language and day', () => {
    const now = new Date('2026-07-16T12:00:00Z');
    const stats = defaultStats();
    stats.introSeen = true;
    stats.activeByLanguage.en = {
      dailyId: dailyDescriptor('en', now).id,
      language: 'en',
      guesses: ['slate'],
      evaluations: [[TILE.ABSENT, TILE.ABSENT, TILE.PRESENT, TILE.ABSENT, TILE.PRESENT]],
      slots: [null, null, 'c', null, null],
      cursorPosition: 3,
      status: 'playing',
      hardMode: false,
      mode: 'daily',
    };

    const { app } = createTestApp({ stats, now });
    const snapshot = app.snapshot();
    expect(snapshot.game.guesses).toEqual(['slate']);
    expect(snapshot.game.slots).toEqual([null, null, 'c', null, null]);
    expect(snapshot.game.cursorPosition).toBe(3);
    expect(snapshot.game.status).toBe('playing');
    expect(snapshot.game.keyState.get('a')).toBe(TILE.PRESENT);
  });

  test('restores completed board without double-recording stats', () => {
    const now = new Date('2026-07-16T12:00:00Z');
    const daily = dailyDescriptor('en', now);
    const stats = defaultStats();
    stats.introSeen = true;
    stats.gamesPlayed = 1;
    stats.wins = 1;
    stats.results[daily.id] = {
      puzzle: daily.number,
      won: true,
      guesses: 1,
      completedAt: now.toISOString(),
      shareText: 'Wordle',
    };
    stats.activeByLanguage.en = {
      dailyId: daily.id,
      language: 'en',
      guesses: ['crane'],
      evaluations: [[TILE.CORRECT, TILE.CORRECT, TILE.CORRECT, TILE.CORRECT, TILE.CORRECT]],
      slots: [null, null, null, null, null],
      cursorPosition: 0,
      status: 'won',
      hardMode: false,
      mode: 'daily',
    };

    const { app } = createTestApp({ stats, now });
    expect(app.snapshot().game.status).toBe('won');
    expect(app.snapshot().game.guesses).toEqual(['crane']);
    expect(app.snapshot().stats.gamesPlayed).toBe(1);

    app.dispatch({ type: 'submit' });
    expect(app.snapshot().stats.gamesPlayed).toBe(1);
  });

  test('archives stale previous-day active sessions on launch', () => {
    const stats = defaultStats();
    stats.introSeen = true;
    stats.activeByLanguage.en = {
      dailyId: 'en:2026-07-15',
      language: 'en',
      guesses: ['slate'],
      evaluations: [[TILE.ABSENT, TILE.ABSENT, TILE.PRESENT, TILE.ABSENT, TILE.PRESENT]],
      slots: ['c', null, null, null, null],
      cursorPosition: 1,
      status: 'playing',
      hardMode: false,
      mode: 'daily',
    };

    const { app, stats: live } = createTestApp({ stats });
    expect(app.snapshot().game.guesses).toEqual([]);
    expect(app.snapshot().game.slots).toEqual([null, null, null, null, null]);
    expect(live.activeByLanguage.en).toBeUndefined();
    expect(live.archivedActive['en:2026-07-15']?.guesses).toEqual(['slate']);
  });

  test('surfaces a non-fatal persistence warning in the snapshot', () => {
    const { app } = createTestApp({
      persistenceWarning: 'Recovered saved state from backup.',
    });
    expect(app.snapshot().persistenceWarning).toBe('Recovered saved state from backup.');
  });
});

describe('daily rollover', () => {
  test('rolls English UTC midnight mid-play with notice and archive', () => {
    const { app, stats, setNow } = createTestApp({ now: new Date('2026-07-16T23:59:00Z') });
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    const oldId = app.snapshot().daily.id;
    expect(oldId).toBe('en:2026-07-16');

    const next = new Date('2026-07-17T00:01:00Z');
    setNow(next);
    app.onTick(next);
    const snapshot = app.snapshot();
    expect(snapshot.daily.id).toBe('en:2026-07-17');
    expect(snapshot.notice).toBe(messages.en.rolloverNotice);
    expect(snapshot.game.guesses).toEqual([]);
    expect(snapshot.game.status).toBe('playing');
    expect(stats.archivedActive[oldId]?.guesses).toEqual(['slate']);
  });

  test('rolls Portuguese America/Sao_Paulo midnight including DST-sensitive boundary', () => {
    // 2026-02-14 is during Brasilia standard time (UTC-3); local midnight is 03:00Z.
    const { app, stats, setNow } = createTestApp({
      language: 'pt',
      now: new Date('2026-02-14T02:59:00Z'),
    });
    typeWord(app, 'texto');
    app.dispatch({ type: 'submit' });
    const oldId = app.snapshot().daily.id;
    expect(oldId).toBe('pt:2026-02-13');

    const next = new Date('2026-02-14T03:01:00Z');
    setNow(next);
    app.onTick(next);
    const snapshot = app.snapshot();
    expect(snapshot.daily.id).toBe('pt:2026-02-14');
    expect(snapshot.notice).toBe(messages.pt.rolloverNotice);
    expect(stats.archivedActive[oldId]?.guesses).toEqual(['texto']);
  });

  test('after completion, rollover offers new daily without double-recording', () => {
    const { app, stats, setNow } = createTestApp({ now: new Date('2026-07-16T23:50:00Z') });
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    expect(stats.gamesPlayed).toBe(1);
    const oldId = app.snapshot().daily.id;

    const next = new Date('2026-07-17T00:10:00Z');
    setNow(next);
    app.onTick(next);
    expect(app.snapshot().daily.id).toBe('en:2026-07-17');
    expect(app.snapshot().game.status).toBe('playing');
    expect(stats.gamesPlayed).toBe(1);
    expect(stats.results[oldId]?.won).toBe(true);
    expect(stats.archivedActive[oldId]?.status).toBe('won');
  });

  test('countdown text changes on tick without keypress', () => {
    const { app, setNow } = createTestApp({ now: new Date('2026-07-16T12:00:00Z') });
    const first = app.snapshot().nextWordIn;
    const next = new Date('2026-07-16T13:30:00Z');
    setNow(next);
    app.onTick(next);
    const second = app.snapshot().nextWordIn;
    expect(first).not.toBe(second);
    expect(second).toBe('10h 30m');
  });

  test('restart after rollover targets the new active daily', () => {
    const { app, setNow } = createTestApp({ now: new Date('2026-07-16T23:59:00Z') });
    typeWord(app, 'slate');
    const next = new Date('2026-07-17T00:05:00Z');
    setNow(next);
    app.onTick(next);
    expect(app.snapshot().daily.id).toBe('en:2026-07-17');

    typeWord(app, 'slate');
    app.dispatch({ type: 'restart' });
    app.dispatch({ type: 'confirmRestart' });
    expect(app.snapshot().daily.id).toBe('en:2026-07-17');
    expect(app.snapshot().game.slots).toEqual([null, null, null, null, null]);
  });
});

describe('hard mode, practice mode, and undo', () => {
  test('toggles hard mode and persists the default setting', () => {
    const { app, stats, saves } = createTestApp();
    expect(app.snapshot().hardMode).toBe(false);

    app.dispatch({ type: 'toggleHardMode' });
    expect(app.snapshot().hardMode).toBe(true);
    expect(app.snapshot().game.hardMode).toBe(true);
    expect(stats.settings.hardModeDefault).toBe(true);
    expect(saves.at(-1)?.settings.hardModeDefault).toBe(true);
    expect(app.snapshot().game.message).toBe(messages.en.hardModeToggled(true));
  });

  test('rejects hard-mode violations without mutating the board', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'toggleHardMode' });
    typeWord(app, 'laser');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.guesses).toEqual(['laser']);

    typeWord(app, 'point');
    app.dispatch({ type: 'submit' });
    const snap = app.snapshot();
    expect(snap.game.guesses).toEqual(['laser']);
    expect(snap.game.slots).toEqual(['p', 'o', 'i', 'n', 't']);
    expect(snap.game.message).toMatch(/Hard mode/i);
    expect(snap.game.status).toBe('playing');
    expect(snap.stats.gamesPlayed).toBe(0);
  });

  test('practice allows more than six guesses and never records daily stats', () => {
    const banksWide: typeof banks = {
      en: {
        language: 'en',
        allWords: {
          crane: 'crane',
          slate: 'slate',
          trace: 'trace',
          aaaaa: 'aaaaa',
          bbbbb: 'bbbbb',
          ccccc: 'ccccc',
          ddddd: 'ddddd',
          eeeee: 'eeeee',
          fffff: 'fffff',
        },
        answers: [{ key: 'crane', text: 'crane' }],
      },
      pt: banks.pt,
    };
    let clock = new Date('2026-07-16T12:00:00Z');
    const stats = defaultStats();
    stats.introSeen = true;
    const saves: GameStats[] = [];
    const app = createWordleApp({
      language: 'en',
      banks: banksWide,
      stats,
      effects: {
        now: () => clock,
        saveStats: (value) => saves.push(structuredClone(value)),
        copyText: () => true,
        choosePracticeAnswer: () => ({ key: 'crane', text: 'crane' }),
      },
    });

    // Seed a daily guess first so practice entry must preserve it.
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    expect(stats.activeByLanguage.en?.guesses).toEqual(['slate']);
    const playedBefore = stats.gamesPlayed;

    app.dispatch({ type: 'togglePractice' });
    expect(app.snapshot().mode).toBe('practice');
    expect(app.snapshot().game.mode).toBe('practice');
    expect(app.snapshot().game.answerKey).toBe('crane');
    expect(app.snapshot().game.guesses).toEqual([]);

    for (const word of ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff']) {
      typeWord(app, word);
      app.dispatch({ type: 'submit' });
      expect(app.snapshot().game.status).toBe('playing');
    }
    expect(app.snapshot().game.guesses).toHaveLength(6);
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.status).toBe('won');
    expect(app.snapshot().game.guesses).toHaveLength(7);
    expect(stats.gamesPlayed).toBe(playedBefore);
    expect(Object.keys(stats.results)).toHaveLength(0);

    // Returning to daily restores the preserved board.
    app.dispatch({ type: 'togglePractice' });
    expect(app.snapshot().mode).toBe('daily');
    expect(app.snapshot().game.guesses).toEqual(['slate']);
    expect(app.snapshot().game.answerKey).toBe('crane');
    expect(stats.gamesPlayed).toBe(playedBefore);
  });

  test('entering practice preserves an unfinished daily board on disk', () => {
    const { app, stats } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'togglePractice' });
    expect(stats.activeByLanguage.en?.guesses).toEqual(['slate']);
    expect(stats.activeByLanguage.en?.mode).toBe('daily');
    expect(app.snapshot().mode).toBe('practice');
  });

  test('undo removes only the latest daily row while result is unrecorded', () => {
    const { app, stats } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    typeWord(app, 'trace');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.guesses).toEqual(['slate', 'trace']);

    app.dispatch({ type: 'undo' });
    expect(app.snapshot().game.guesses).toEqual(['slate']);
    expect(app.snapshot().game.status).toBe('playing');
    expect(app.snapshot().game.message).toBe(messages.en.undoDone);
    expect(stats.activeByLanguage.en?.guesses).toEqual(['slate']);
  });

  test('daily undo is blocked after a recorded completed result', () => {
    const { app, stats } = createTestApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.status).toBe('won');
    expect(stats.gamesPlayed).toBe(1);
    expect(app.snapshot().canUndo).toBe(false);

    app.dispatch({ type: 'undo' });
    expect(app.snapshot().game.status).toBe('won');
    expect(app.snapshot().game.guesses).toEqual(['crane']);
    expect(app.snapshot().game.message).toBe(messages.en.undoBlocked);
    expect(stats.gamesPlayed).toBe(1);
  });

  test('practice can undo a terminal win because it has no stats', () => {
    let clock = new Date('2026-07-16T12:00:00Z');
    const stats = defaultStats();
    stats.introSeen = true;
    const app = createWordleApp({
      language: 'en',
      banks,
      stats,
      effects: {
        now: () => clock,
        saveStats: () => {},
        copyText: () => true,
        choosePracticeAnswer: () => ({ key: 'crane', text: 'crane' }),
      },
    });
    app.dispatch({ type: 'togglePractice' });
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    expect(app.snapshot().game.status).toBe('won');
    expect(app.snapshot().canUndo).toBe(true);

    app.dispatch({ type: 'undo' });
    expect(app.snapshot().game.status).toBe('playing');
    expect(app.snapshot().game.guesses).toEqual([]);
    expect(stats.gamesPlayed).toBe(0);
  });

  test('undo is a no-op message when there is no submitted row', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'undo' });
    expect(app.snapshot().game.message).toBe(messages.en.undoEmpty);
  });
});

describe('practice session coherence', () => {
  test('hard-mode toggle in practice updates the preserved daily session', () => {
    const { app, stats } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'togglePractice' });
    app.dispatch({ type: 'toggleHardMode' });

    expect(app.snapshot().mode).toBe('practice');
    expect(stats.settings.hardModeDefault).toBe(true);
    expect(stats.activeByLanguage.en?.hardMode).toBe(true);

    app.dispatch({ type: 'togglePractice' });
    expect(app.snapshot().mode).toBe('daily');
    expect(app.snapshot().hardMode).toBe(true);
    expect(app.snapshot().game.guesses).toEqual(['slate']);
  });

  test('daily rollover during practice archives the suspended board and returns to new daily', () => {
    const { app, stats, setNow } = createTestApp({
      now: new Date('2026-07-16T23:59:00Z'),
    });
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    const previousId = app.snapshot().daily.id;
    app.dispatch({ type: 'togglePractice' });

    const next = new Date('2026-07-17T00:01:00Z');
    setNow(next);
    app.onTick(next);
    expect(app.snapshot().mode).toBe('practice');
    expect(app.snapshot().notice).toBe(messages.en.rolloverNotice);
    expect(stats.archivedActive[previousId]?.guesses).toEqual(['slate']);

    app.dispatch({ type: 'togglePractice' });
    expect(app.snapshot().mode).toBe('daily');
    expect(app.snapshot().daily.id).toBe('en:2026-07-17');
    expect(app.snapshot().game.guesses).toEqual([]);
  });

  test('switching language from practice restores the target daily session', () => {
    const { app, stats } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'switchLanguage' });
    typeWord(app, 'texto');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'togglePractice' });

    app.dispatch({ type: 'switchLanguage' });
    expect(app.snapshot().mode).toBe('daily');
    expect(app.snapshot().language).toBe('en');
    expect(app.snapshot().game.guesses).toEqual(['slate']);
    expect(stats.activeByLanguage.pt?.guesses).toEqual(['texto']);
  });
});

describe('tips click', () => {
  test('fills the row from a tip, returns to the game, and does not submit', () => {
    const { app } = createTestApp();
    app.dispatch({ type: 'openTips' });

    app.dispatch({ type: 'useTip', word: 'slate' });

    const snapshot = app.snapshot();
    expect(snapshot.view).toBe('game');
    expect(snapshot.game.slots).toEqual(['s', 'l', 'a', 't', 'e']);
    expect(snapshot.game.guesses).toEqual([]);
  });

  test('leaves a finished board unchanged', () => {
    const { app } = createTestApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'openTips' });

    app.dispatch({ type: 'useTip', word: 'slate' });

    expect(app.snapshot().view).toBe('game');
    expect(app.snapshot().game.guesses).toEqual(['crane']);
  });
});

describe('restored sessions use their own language dictionary', () => {
  test('restart after restoring a board saved in another language', () => {
    const { app } = createTestApp({ language: 'pt' });
    typeWord(app, 'texto');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'switchLanguage' });
    app.dispatch({ type: 'switchLanguage' });

    expect(app.snapshot().language).toBe('pt');
    expect(app.snapshot().game.guesses).toEqual(['texto']);
    expect(() => {
      app.dispatch({ type: 'restart' });
      app.dispatch({ type: 'confirmRestart' });
    }).not.toThrow();
    expect(app.snapshot().game.guesses).toEqual([]);
  });

  test('guesses after the restore are checked against the restored language', () => {
    const { app } = createTestApp({ language: 'pt' });
    typeWord(app, 'texto');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'switchLanguage' });
    app.dispatch({ type: 'switchLanguage' });

    typeWord(app, 'sabio');
    app.dispatch({ type: 'submit' });

    expect(app.snapshot().game.guesses).toEqual(['texto', 'sábio']);
  });
});
