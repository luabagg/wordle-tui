import { afterEach, describe, expect, test } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createWordleApp } from '../src/app';
import type { WordBank } from '../src/dictionary';
import { createOpenTuiView } from '../src/opentui-view';
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

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function createApp(copyText: (text: string) => boolean = () => true) {
  const stats = defaultStats();
  stats.introSeen = true;
  return createWordleApp({
    language: 'en',
    banks,
    stats,
    effects: {
      now: () => new Date('2026-07-16T12:00:00Z'),
      saveStats: () => {},
      copyText,
    },
  });
}

async function setup(width = 72, height = 30) {
  const testRenderer = await createTestRenderer({ width, height });
  const view = createOpenTuiView(testRenderer.renderer);
  cleanups.push(() => {
    view.destroy();
    testRenderer.renderer.destroy();
  });
  return { ...testRenderer, view };
}

function typeWord(app: ReturnType<typeof createWordleApp>, word: string): void {
  for (const char of word) app.dispatch({ type: 'type', char });
}

describe('OpenTUI view', () => {
  test('renders the game board, keyboard, and localized status', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame } = await setup();

    view.render(app.snapshot());
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain('WORDLE TUI');
    expect(frame).toContain('Guess the 5-letter word');
    expect(frame).toMatch(/Q\s+W\s+E\s+R\s+T\s+Y/);
    expect(frame).toContain('Daily word loaded');
    expect((frame.match(/·/g) || []).length).toBeGreaterThanOrEqual(30);
  });

  test('renders evaluated tile colors through OpenTUI spans', async () => {
    const app = createApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    const { view, renderOnce, captureSpans } = await setup();

    view.render(app.snapshot());
    await renderOnce();
    const spans = captureSpans().lines.flatMap((line) => line.spans);
    const correctLetter = spans.find((span) => span.text === 'C' && span.bg.toInts()[1] === 239);

    expect(correctLetter).toBeDefined();
    expect(correctLetter?.bg.toInts().slice(0, 3)).toEqual([134, 239, 172]);
  });

  test('renders help, progress, and tips as distinct views', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame } = await setup();

    app.dispatch({ type: 'openHelp' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Shortcuts:');

    app.dispatch({ type: 'backToGame' });
    app.dispatch({ type: 'openProgress' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Next word in');

    app.dispatch({ type: 'backToGame' });
    app.dispatch({ type: 'openTips' });
    view.render(app.snapshot());
    await renderOnce();
    const tipsFrame = captureCharFrame();
    expect(tipsFrame).toContain('candidate');
    expect(tipsFrame).toContain('Top entropy guesses');
  });

  test('shows a clear minimum-size message after resize', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame, resize } = await setup();

    resize(25, 10);
    view.render(app.snapshot());
    await renderOnce();

    expect(captureCharFrame()).toContain('Terminal too small');
  });

  test('reveals share text even when clipboard support is unavailable', async () => {
    const app = createApp(() => false);
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'share' });
    const { view, renderOnce, captureCharFrame } = await setup();

    view.render(app.snapshot());
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain('Clipboard unavailable');
    expect(frame).toContain('Wordle');
    expect(frame).toContain('🟩🟩🟩🟩🟩');
  });

  test('destroys the renderable tree without destroying twice', async () => {
    const { view, renderer } = await setup();
    view.destroy();
    view.destroy();

    expect(view.root.isDestroyed).toBe(true);
    expect(renderer.isDestroyed).toBe(false);
  });
});
