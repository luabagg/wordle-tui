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
      currentGuess: '',
      cursorPosition: 0,
      status: 'playing',
      message: '',
      keyState: new Map(),
      language: 'en',
    },
    tips: null,
  };
}

function setupFakes() {
  const renderer = new FakeRenderer();
  const actions: unknown[] = [];
  let snapshot = fakeSnapshot();
  let capturedAppOptions: CreateWordleAppOptions | undefined;
  const app: WordleApp = {
    snapshot: () => snapshot,
    dispatch: (action) => {
      actions.push(action);
      return { shouldQuit: action.type === 'quit' };
    },
    getGame: () => { throw new Error('not needed'); },
    getTips: () => ({ candidates: [], ranked: [], bestCandidate: null }),
  };
  let renderCalls = 0;
  let viewDestroyCalls = 0;
  const view: OpenTuiView = {
    root: { isDestroyed: false } as OpenTuiView['root'],
    render: () => { renderCalls += 1; },
    destroy: () => { viewDestroyCalls += 1; },
  };

  return {
    renderer,
    app,
    view,
    actions,
    setSnapshot: (value: AppSnapshot) => { snapshot = value; },
    getRenderCalls: () => renderCalls,
    getViewDestroyCalls: () => viewDestroyCalls,
    getCapturedAppOptions: () => capturedAppOptions,
    dependencies: {
      isTty: () => true,
      createRenderer: async (_config: CliRendererConfig) => renderer as unknown as CliRenderer,
      createApp: ((options: CreateWordleAppOptions) => {
        capturedAppOptions = options;
        return app;
      }) as typeof import('../src/app').createWordleApp,
      createView: (() => view) as typeof import('../src/opentui-view').createOpenTuiView,
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

  test('creates the renderer with OpenTUI lifecycle ownership and renders once', async () => {
    const fakes = setupFakes();
    let config: CliRendererConfig | undefined;
    const runtime = await run(['--lang=en'], {
      ...fakes.dependencies,
      createRenderer: async (value) => {
        config = value;
        return fakes.renderer as unknown as CliRenderer;
      },
    });

    expect(config).toMatchObject({
      screenMode: 'alternate-screen',
      exitOnCtrlC: false,
      clearOnShutdown: true,
      consoleMode: 'disabled',
      useMouse: false,
    });
    expect(fakes.getRenderCalls()).toBe(1);
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

    fakes.renderer.emit(CliRenderEvents.RESIZE, 100, 40);
    expect(fakes.getRenderCalls()).toBe(3);

    fakes.renderer.keyInput.emit('keypress', { name: 'c', sequence: '\u0003', ctrl: true, meta: false });
    runtime.shutdown();
    expect(fakes.getViewDestroyCalls()).toBe(1);
    expect(fakes.renderer.destroyCalls).toBe(1);
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
