import { afterEach, describe, expect, test } from 'bun:test';
import { ScrollBoxRenderable, TextAttributes } from '@opentui/core';
import { createTestRenderer, setRendererCapabilities } from '@opentui/core/testing';
import { createWordleApp } from '../src/app';
import type { WordBank } from '../src/dictionary';
import { resolveOpenTuiKey, resolvePointer } from '../src/input';
import { createOpenTuiView, shortcutColumn, wrapBullet } from '../src/opentui-view';
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

function createApp(
  copyText: (text: string) => boolean = () => true,
  language: 'en' | 'pt' = 'en',
) {
  const stats = defaultStats();
  stats.introSeen = true;
  return createWordleApp({
    language,
    banks,
    stats,
    effects: {
      now: () => new Date('2026-07-16T12:00:00Z'),
      saveStats: () => {},
      copyText,
    },
  });
}

// ensure snapshot fields used by the view are present in older fixtures

async function setup(
  width = 72,
  height = 30,
  capabilities?: { rgb?: boolean; ansi256?: boolean; unicode?: 'unicode' | 'wcwidth' },
  glyphs?: 'unicode' | 'ascii',
) {
  const testRenderer = await createTestRenderer({ width, height });
  if (capabilities) setRendererCapabilities(testRenderer.renderer, capabilities);
  const view = createOpenTuiView(testRenderer.renderer, { glyphs });
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

  test('renders sparse editable slots independently', async () => {
    const app = createApp();
    app.dispatch({ type: 'setCursor', position: 3 });
    app.dispatch({ type: 'type', char: 'a' });
    const { view, renderOnce, captureCharFrame } = await setup();

    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toMatch(/·\s+·\s+·\s+A\s+·/);
  });

  test('renders active, evaluated, and keyboard tile colors through OpenTUI spans', async () => {
    const app = createApp();
    const setupResult = await setup();

    setupResult.view.render(app.snapshot());
    await setupResult.renderOnce();
    const active = setupResult.captureSpans().lines
      .flatMap((line) => line.spans)
      .find((span) => span.text === '·' && span.bg.toInts()[2] === 248);
    expect(active?.bg.toInts().slice(0, 3)).toEqual([56, 189, 248]);

    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    setupResult.view.render(app.snapshot());
    await setupResult.renderOnce();
    const spans = setupResult.captureSpans().lines.flatMap((line) => line.spans);
    const coloredS = spans.filter((span) => span.text === 'S' && span.bg.toInts()[0] === 161);

    expect(coloredS.length).toBeGreaterThanOrEqual(2);
  });

  test('renders help, progress, and tips as distinct views', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame } = await setup();

    app.dispatch({ type: 'openHelp' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toMatch(/• Enter\s+submit guess\s+• Esc\s+quit/);

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

  test('shows a localized minimum-size message after resize', async () => {
    const app = createApp(() => true, 'pt');
    const { view, renderOnce, captureCharFrame, resize } = await setup();

    resize(25, 10);
    view.render(app.snapshot());
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain('TERMO TUI');
    expect(frame.replace(/\s+/g, ' ')).toContain('Terminal pequeno demais');
  });

  test('uses a compact board-first layout at a short but supported size', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame } = await setup(40, 17);

    view.render(app.snapshot());
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain('WORDLE TUI');
    expect((frame.match(/·/g) || []).length).toBeGreaterThanOrEqual(30);
    expect(frame).not.toMatch(/Q\s+W\s+E\s+R\s+T\s+Y/);
  });

  test('shows a finished share prompt and successful copy state', async () => {
    const app = createApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    const { view, renderOnce, captureCharFrame } = await setup();

    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Share: press S to copy');

    app.dispatch({ type: 'share' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Result copied');
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

  test('keeps secondary views accessible at their accepted minimum heights', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame } = await setup(72, 16);

    app.dispatch({ type: 'openHelp' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Back: Esc or ?');

    app.dispatch({ type: 'backToGame' });
    app.dispatch({ type: 'openProgress' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Back: Esc or Ctrl+P');

    app.dispatch({ type: 'backToGame' });
    app.dispatch({ type: 'openTips' });
    view.render(app.snapshot());
    await renderOnce();
    expect(captureCharFrame()).toContain('Back: Tab or Esc');
  });

  test('keeps copied results visible at the accepted share height', async () => {
    const app = createApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'share' });
    const { view, renderOnce, captureCharFrame } = await setup(72, 20);

    view.render(app.snapshot());
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Result copied');
    expect(frame).toContain('🟩🟩🟩🟩🟩');
  });

  test('degrades to distinguishable monochrome rendering with OpenTUI capability mocks', async () => {
    const app = createApp();
    typeWord(app, 'trace');
    app.dispatch({ type: 'submit' });
    const { view, renderOnce, captureCharFrame, captureSpans } = await setup(72, 30, {
      rgb: false,
      ansi256: false,
      unicode: 'unicode',
    });

    view.render(app.snapshot());
    await renderOnce();
    const frame = captureCharFrame();
    const spans = captureSpans().lines.flatMap((line) => line.spans);

    expect(view.getPresentationMode()).toEqual({ color: 'none', glyphs: 'unicode' });
    expect(frame).toMatch(/t\s+R\s+A\s+c\s+E/);
    expect(spans.find((span) => span.text === 't')?.attributes).toBe(0);
    expect(spans.find((span) => span.text === 'R')?.attributes).toBe(TextAttributes.BOLD);
    expect(spans.find((span) => span.text === 'c')?.attributes).toBe(TextAttributes.UNDERLINE);
    expect(frame).toContain('(bold)');
    expect(frame).toContain('(underline)');
  });

  test('does not treat OpenTUI wcwidth WidthMethod as missing Unicode support', async () => {
    const { view } = await setup(72, 30, {
      rgb: true,
      ansi256: true,
      unicode: 'wcwidth',
    });
    expect(view.getPresentationMode()).toEqual({ color: 'rgb', glyphs: 'unicode' });
  });

  test('uses stable ASCII layout and share glyphs when explicitly requested', async () => {
    const app = createApp();
    typeWord(app, 'crane');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'share' });

    const ascii = await setup(72, 30, {
      rgb: false,
      ansi256: false,
      unicode: 'wcwidth',
    }, 'ascii');
    ascii.view.render(app.snapshot());
    await ascii.renderOnce();
    const asciiFrame = ascii.captureCharFrame();

    expect(ascii.view.getPresentationMode()).toEqual({ color: 'none', glyphs: 'ascii' });
    expect(asciiFrame).toContain('GGGGG');
    expect(asciiFrame).not.toContain('🟩');
    expect(asciiFrame).not.toContain('·');

    const full = await setup(72, 30, { rgb: true, ansi256: true, unicode: 'unicode' });
    full.view.render(app.snapshot());
    await full.renderOnce();
    expect(asciiFrame.split('\n')).toHaveLength(full.captureCharFrame().split('\n').length);
  });

  test('uses the basic palette when RGB is unavailable but ANSI-256 is present', async () => {
    const { view } = await setup(72, 30, {
      rgb: false,
      ansi256: true,
      unicode: 'unicode',
    });
    expect(view.getPresentationMode()).toEqual({ color: 'basic', glyphs: 'unicode' });
  });

  test('destroys the renderable tree without destroying twice', async () => {
    const { view, renderer } = await setup();
    view.destroy();
    view.destroy();

    expect(view.root.isDestroyed).toBe(true);
    expect(renderer.isDestroyed).toBe(false);
  });
});

test('renders hard-mode indicator and scrolls a practice board past six rows', async () => {
  const app = createApp();
  app.dispatch({ type: 'toggleHardMode' });
  app.dispatch({ type: 'togglePractice' });
  for (let i = 0; i < 6; i += 1) {
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
  }
  typeWord(app, 'crane');
  app.dispatch({ type: 'submit' });

  const { view, renderOnce, captureCharFrame } = await setup(72, 30);
  view.render(app.snapshot());
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain('[HARD]');
  expect(frame).toContain('[PRACTICE]');
  expect(frame).toContain('7 guesses used');
  expect(frame).toMatch(/C\s+R\s+A\s+N\s+E/);
});

describe('OpenTUI view mouse input', () => {
  async function mouseSetup(width = 72, height = 30) {
    const app = createApp();
    const testRenderer = await createTestRenderer({ width, height, useMouse: true });
    const render = () => view.render(app.snapshot());
    const view = createOpenTuiView(testRenderer.renderer, {
      onPointer: (target) => {
        const snapshot = app.snapshot();
        app.dispatch(resolvePointer({
          view: snapshot.view,
          status: snapshot.game.status,
          introPending: snapshot.introPending,
        }, target));
        render();
      },
    });
    cleanups.push(() => {
      view.destroy();
      testRenderer.renderer.destroy();
    });
    render();
    await testRenderer.renderOnce();

    async function click(id: string): Promise<void> {
      const target = testRenderer.renderer.root.findDescendantById(id);
      if (!target) throw new Error(`missing renderable ${id}`);
      await testRenderer.mockMouse.click(target.x + 1, target.y);
      await testRenderer.renderOnce();
    }

    return { app, click, render, ...testRenderer };
  }

  test('on-screen keys type, delete, and submit', async () => {
    const { app, click } = await mouseSetup();

    for (const letter of 'slatx') await click(`key-${letter}`);
    await click('key-backspace');
    await click('key-e');
    expect(app.snapshot().game.slots).toEqual(['s', 'l', 'a', 't', 'e']);

    await click('key-enter');
    expect(app.snapshot().game.guesses).toEqual(['slate']);
  });

  test('a click on an editable slot moves the cursor; other rows ignore clicks', async () => {
    const { app, click } = await mouseSetup();

    await click('tile-0-3');
    expect(app.snapshot().game.cursorPosition).toBe(3);

    await click('tile-2-1');
    expect(app.snapshot().game.cursorPosition).toBe(3);
  });

  test('a click on a tip fills the row and returns to the game', async () => {
    const { app, click, render, renderOnce, captureCharFrame } = await mouseSetup();
    app.dispatch({ type: 'openTips' });
    render();
    await renderOnce();
    const tipWord = app.snapshot().tips!.ranked[0].guess;

    await click('tips-view-row-0');

    expect(app.snapshot().view).toBe('game');
    expect(app.snapshot().game.slots.join('')).toBe(tipWord);
    expect(captureCharFrame()).toContain('WORDLE TUI');
  });

  test('hidden panels do not receive clicks', async () => {
    const { app, click } = await mouseSetup();
    app.dispatch({ type: 'openHelp' });

    await click('key-a');

    expect(app.snapshot().game.slots).toEqual([null, null, null, null, null]);
  });

  test('tips scroll by wheel and arrows, and keys still close them', async () => {
    const { app, render, renderOnce, renderer, mockMouse, mockInput } = await mouseSetup(72, 16);
    renderer.keyInput.on('keypress', (key) => {
      const snapshot = app.snapshot();
      app.dispatch(resolveOpenTuiKey({
        view: snapshot.view,
        status: snapshot.game.status,
        introPending: snapshot.introPending,
      }, key));
      render();
    });
    app.dispatch({ type: 'openTips' });
    await app.flushTips();
    render();
    await renderOnce();
    const scroll = renderer.root.findDescendantById('tips-view-scroll') as ScrollBoxRenderable;

    await mockMouse.scroll(scroll.x + 2, scroll.y + 2, 'down');
    await renderOnce();
    const afterWheel = scroll.scrollTop;
    expect(afterWheel).toBeGreaterThan(0);

    mockInput.pressArrow('down');
    await renderOnce();
    expect(scroll.scrollTop).toBeGreaterThan(afterWheel);

    // The focused scroll box must not swallow keys. Tab avoids the lone-ESC parser timeout.
    mockInput.pressTab();
    await renderOnce();
    expect(app.snapshot().view).toBe('game');
  });

  test('tips show the decision path, next question, and basis', async () => {
    const { app, render, renderOnce, captureCharFrame } = await mouseSetup(72, 40);
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    app.dispatch({ type: 'openTips' });
    render();
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain('Decision path');
    expect(frame).toMatch(/SLATE ××✓×✓\s+1\s+\+0\.00 bits/);
    expect(frame).toContain('Next question: CRANE');
    expect(frame).toContain('Basis:');
  });
});

describe('shortcut layout', () => {
  test('shows shortcuts in two columns when the terminal is tall enough', async () => {
    const app = createApp(undefined, 'pt');
    const { view, renderOnce, captureCharFrame } = await setup(72, 30);

    view.render(app.snapshot());
    await renderOnce();

    expect(captureCharFrame()).toMatch(/• Enter\s+enviar palpite\s+• \?\s+ajuda e atalhos/);
  });

  test('replaces the columns with a one-line hint when height is short', async () => {
    const app = createApp();
    const { view, renderOnce, captureCharFrame } = await setup(72, 23);

    view.render(app.snapshot());
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain('Press ? for help and shortcuts.');
    expect(frame).not.toContain('submit guess');
  });

  test('aligns keys, and switches every line to "keys: action" when one overflows', () => {
    const hints = [['Enter', 'submit guess'], ['Backspace', 'clear previous slot']] as const;

    expect(shortcutColumn(hints, '•')).toBe('• Enter      submit guess\n• Backspace  clear previous slot');
    expect(shortcutColumn(hints, '-', 20)).toBe('- Enter: submit\n  guess\n- Backspace: clear\n  previous slot');
  });

  test('wraps bullet items with a hanging indent', () => {
    expect(wrapBullet('one two three four', 11, '•')).toBe('• one two\n  three\n  four');
  });
});
