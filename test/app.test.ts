import { describe, expect, test } from 'bun:test';
import { createWordleApp, parseLanguage } from '../src/app';
import type { WordBank } from '../src/dictionary';
import { defaultStats } from '../src/stats';

const banks: Record<'en' | 'pt', WordBank> = {
  en: {
    language: 'en',
    allWords: { crane: 'crane', slate: 'slate', trace: 'trace' },
    answers: [{ key: 'crane', text: 'crane' }],
  },
  pt: {
    language: 'pt',
    allWords: { termo: 'termo', texto: 'texto', sabio: 'sábio' },
    answers: [{ key: 'termo', text: 'termo' }],
  },
};

const fixedNow = new Date('2026-07-16T12:00:00Z');

function createTestApp(options: {
  introSeen?: boolean;
  copyText?: (text: string) => boolean;
} = {}) {
  const stats = defaultStats();
  stats.introSeen = options.introSeen ?? true;
  const saves: string[] = [];
  const copies: string[] = [];
  const app = createWordleApp({
    language: 'en',
    banks,
    stats,
    effects: {
      now: () => fixedNow,
      saveStats: (value) => saves.push(JSON.stringify(value)),
      copyText: (text) => {
        copies.push(text);
        return options.copyText?.(text) ?? true;
      },
    },
  });
  return { app, stats, saves, copies };
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
    expect(saves).toHaveLength(1);

    app.dispatch({ type: 'dismissIntro' });
    expect(saves).toHaveLength(1);
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

  test('restarts the active game without changing the daily answer', () => {
    const { app } = createTestApp();
    typeWord(app, 'slate');
    expect(app.snapshot().game.currentGuess).toBe('slate');
    app.dispatch({ type: 'restart' });
    expect(app.snapshot().game.currentGuess).toBe('');
    expect(app.snapshot().game.answerKey).toBe('crane');
    expect(app.snapshot().game.status).toBe('playing');
  });

  test('switches language and resets the daily game', () => {
    const { app } = createTestApp();
    typeWord(app, 'slate');
    app.dispatch({ type: 'switchLanguage' });
    const snapshot = app.snapshot();
    expect(snapshot.language).toBe('pt');
    expect(snapshot.game.language).toBe('pt');
    expect(snapshot.game.answerKey).toBe('termo');
    expect(snapshot.game.currentGuess).toBe('');
    expect(snapshot.view).toBe('game');
  });

  test('records and saves a completed daily result exactly once', () => {
    const { app, saves } = createTestApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });

    expect(app.snapshot().game.status).toBe('won');
    expect(app.snapshot().stats.gamesPlayed).toBe(1);
    expect(saves).toHaveLength(1);

    app.dispatch({ type: 'submit' });
    expect(app.snapshot().stats.gamesPlayed).toBe(1);
    expect(saves).toHaveLength(1);
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
    const before = app.snapshot().game.currentGuess;
    expect(app.dispatch({ type: 'quit' })).toEqual({ shouldQuit: true });
    expect(app.snapshot().game.currentGuess).toBe(before);
  });
});
