import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'bun:test';
import { CliRenderEvents } from '@opentui/core';
import type { CliRenderer, CliRendererConfig } from '@opentui/core';
import type { AppSnapshot, CreateWordleAppOptions, WordleApp } from '../src/app';
import { run } from '../src/cli';
import type { OpenTuiView } from '../src/opentui-view';
import { main } from '../src/index';
import { defaultStats } from '../src/stats';

class FakeRenderer extends EventEmitter {
  readonly keyInput = new EventEmitter();
  isDestroyed = false;
  destroyCalls = 0;
  copied: string[] = [];

  copyToClipboardOSC52(text: string): boolean {
    this.copied.push(text);
    return true;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.destroyCalls += 1;
    this.emit(CliRenderEvents.DESTROY);
  }
}

function fakeSnapshot(): AppSnapshot {
  return {
    view: 'game',
    introPending: false,
    shareCopied: false,
    shareCopySucceeded: false,
    shareText: null,
    language: 'en',
    daily: { id: 'en:2026-07-16', number: 1854 },
    nextWordIn: '12h 00m',
    stats: defaultStats(),
    game: {
      answer: 'crane',
      answerKey: 'crane',
      guesses: [],
      evaluations: [],
      slots: [null, null, null, null, null],
      cursorPosition: 0,
      status: 'playing',
      message: '',
      keyState: new Map(),
      language: 'en',
      hardMode: false,
      mode: 'daily',
      maxGuesses: 6,
    },
    tips: null,
    notice: null,
    persistenceWarning: null,
    restartConfirmPending: false,
    mode: 'daily',
    hardMode: false,
    canUndo: false,
  };
}

function setupFakes() {
  const renderer = new FakeRenderer();
  const actions: unknown[] = [];
  let snapshot = fakeSnapshot();
  let capturedAppOptions: CreateWordleAppOptions | undefined;
  let tickCalls = 0;
  let flushTipsCalls = 0;
  const app: WordleApp = {
    snapshot: () => snapshot,
    dispatch: (action) => {
      actions.push(action);
      return { shouldQuit: action.type === 'quit' };
    },
    onTick: () => { tickCalls += 1; },
    getGame: () => { throw new Error('not needed'); },
    getTips: () => ({
      candidates: [],
      ranked: [],
      bestCandidate: null,
      status: 'ready',
      cacheKey: 'en|',
    }),
    flushTips: async () => { flushTipsCalls += 1; },
  };
  let renderCalls = 0;
  let viewDestroyCalls = 0;
  const intervals: Array<{ handler: () => void; ms: number }> = [];
  const cleared: unknown[] = [];
  const view: OpenTuiView = {
    root: { isDestroyed: false } as OpenTuiView['root'],
    render: () => { renderCalls += 1; },
    destroy: () => { viewDestroyCalls += 1; },
    getPresentationMode: () => ({ color: 'rgb', glyphs: 'unicode' }),
  };

  return {
    renderer,
    app,
    view,
    actions,
    intervals,
    setSnapshot: (value: AppSnapshot) => { snapshot = value; },
    getRenderCalls: () => renderCalls,
    getViewDestroyCalls: () => viewDestroyCalls,
    getTickCalls: () => tickCalls,
    getFlushTipsCalls: () => flushTipsCalls,
    getCleared: () => cleared,
    getCapturedAppOptions: () => capturedAppOptions,
    dependencies: {
      isTty: () => true,
      createRenderer: async (_config: CliRendererConfig) => renderer as unknown as CliRenderer,
      createApp: ((options: CreateWordleAppOptions) => {
        capturedAppOptions = options;
        return app;
      }) as typeof import('../src/app').createWordleApp,
      createView: (() => view) as typeof import('../src/opentui-view').createOpenTuiView,
      timers: {
        setInterval: (handler: () => void, ms: number) => {
          const handle = { handler, ms };
          intervals.push(handle);
          return handle;
        },
        clearInterval: (handle: unknown) => { cleared.push(handle); },
      },
    },
  };
}

describe('OpenTUI CLI lifecycle', () => {
  test('rejects non-TTY use before creating a renderer', async () => {
    let createCalls = 0;
    await expect(run([], {
      isTty: () => false,
      createRenderer: async () => {
        createCalls += 1;
        return new FakeRenderer() as unknown as CliRenderer;
      },
    })).rejects.toThrow('interactive terminal');
    expect(createCalls).toBe(0);
  });

  test('creates the renderer with lifecycle ownership and explicit ASCII option', async () => {
    const fakes = setupFakes();
    let config: CliRendererConfig | undefined;
    let glyphs: 'unicode' | 'ascii' | undefined;
    const runtime = await run(['--lang=en'], {
      ...fakes.dependencies,
      createRenderer: async (value) => {
        config = value;
        return fakes.renderer as unknown as CliRenderer;
      },
      useAsciiGlyphs: () => true,
      createView: ((_renderer, options) => {
        glyphs = options?.glyphs;
        return fakes.view;
      }) as typeof import('../src/opentui-view').createOpenTuiView,
    });

    expect(config).toMatchObject({
      screenMode: 'alternate-screen',
      exitOnCtrlC: false,
      clearOnShutdown: true,
      consoleMode: 'disabled',
      useMouse: false,
    });
    expect(fakes.getRenderCalls()).toBe(1);
    expect(glyphs).toBe('ascii');
    expect(fakes.getCapturedAppOptions()?.language).toBe('en');
    expect(fakes.getCapturedAppOptions()?.effects?.copyText?.('result')).toBe(true);
    expect(fakes.renderer.copied).toEqual(['result']);
    runtime.shutdown();
  });

  test('dispatches keys, redraws on resize, and shuts down exactly once', async () => {
    const fakes = setupFakes();
    const runtime = await run([], fakes.dependencies);

    fakes.renderer.keyInput.emit('keypress', { name: 'a', sequence: 'a', ctrl: false, meta: false });
    expect(fakes.actions).toContainEqual({ type: 'type', char: 'a' });
    expect(fakes.getRenderCalls()).toBe(2);

    fakes.renderer.keyInput.emit('paste', { bytes: new TextEncoder().encode('sábio') });
    expect(fakes.actions).toContainEqual({ type: 'paste', text: 'sábio' });
    expect(fakes.getRenderCalls()).toBe(3);

    fakes.renderer.emit(CliRenderEvents.RESIZE, 100, 40);
    expect(fakes.getRenderCalls()).toBe(4);

    fakes.renderer.keyInput.emit('keypress', { name: 'c', sequence: '\u0003', ctrl: true, meta: false });
    runtime.shutdown();
    expect(fakes.getViewDestroyCalls()).toBe(1);
    expect(fakes.renderer.destroyCalls).toBe(1);
  });

  test('repaints when cooperative tips ranking completes', async () => {
    const fakes = setupFakes();
    const runtime = await run([], fakes.dependencies);
    const before = fakes.getRenderCalls();

    fakes.renderer.keyInput.emit('keypress', {
      name: 'tab',
      sequence: '\t',
      ctrl: false,
      meta: false,
    });
    await Bun.sleep(0);

    expect(fakes.actions).toContainEqual({ type: 'openTips' });
    expect(fakes.getFlushTipsCalls()).toBe(1);
    expect(fakes.getRenderCalls()).toBe(before + 2);
    runtime.shutdown();
  });

  test('destroys a renderer when view creation fails', async () => {
    const renderer = new FakeRenderer();
    await expect(run([], {
      isTty: () => true,
      createRenderer: async () => renderer as unknown as CliRenderer,
      createView: (() => { throw new Error('view failed'); }) as typeof import('../src/opentui-view').createOpenTuiView,
    })).rejects.toThrow('view failed');
    expect(renderer.destroyCalls).toBe(1);
  });

  test('starts a minute countdown timer and clears it on shutdown', async () => {
    const fakes = setupFakes();
    const runtime = await run([], fakes.dependencies);

    expect(fakes.intervals).toHaveLength(1);
    expect(fakes.intervals[0]?.ms).toBe(60_000);

    const before = fakes.getRenderCalls();
    fakes.intervals[0]?.handler();
    expect(fakes.getTickCalls()).toBe(1);
    expect(fakes.getRenderCalls()).toBe(before + 1);

    runtime.shutdown();
    expect(fakes.getCleared()).toHaveLength(1);
    expect(fakes.getCleared()[0]).toBe(fakes.intervals[0]);
  });
});

describe('ESM entrypoint routing', () => {
  test('loads MCP without importing the CLI branch', async () => {
    let cliLoads = 0;
    let mcpRuns = 0;
    await main(['--mcp'], {
      loadCli: async () => {
        cliLoads += 1;
        return { run: async () => {} };
      },
      loadMcp: async () => ({
        main: async () => { mcpRuns += 1; },
      }),
    });

    expect(cliLoads).toBe(0);
    expect(mcpRuns).toBe(1);
  });

  test('passes CLI arguments through without loading MCP', async () => {
    let received: string[] | undefined;
    let mcpLoads = 0;
    await main(['--lang=pt'], {
      loadCli: async () => ({
        run: async (argv) => { received = argv; },
      }),
      loadMcp: async () => {
        mcpLoads += 1;
        return { main: async () => {} };
      },
    });

    expect(received).toEqual(['--lang=pt']);
    expect(mcpLoads).toBe(0);
  });
});
