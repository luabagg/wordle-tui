import {
  CliRenderEvents,
  createCliRenderer,
  decodePasteBytes,
} from '@opentui/core';
import type {
  CliRenderer,
  CliRendererConfig,
  KeyEvent,
  PasteEvent,
} from '@opentui/core';
import { createWordleApp, parseLanguage } from './app';
import type { WordleApp } from './app';
import { resolveOpenTuiKey, resolvePointer } from './input';
import type { Action, PointerTarget, ResolveContext } from './input';
import { createOpenTuiView } from './opentui-view';
import type { OpenTuiView } from './opentui-view';

export const COUNTDOWN_TICK_MS = 60_000;

export interface CliRuntime {
  readonly renderer: CliRenderer;
  readonly app: WordleApp;
  readonly view: OpenTuiView;
  shutdown(): void;
}

export interface CliTimerHandles {
  setInterval: (handler: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface CliDependencies {
  isTty: () => boolean;
  createRenderer: (config: CliRendererConfig) => Promise<CliRenderer>;
  createApp: typeof createWordleApp;
  createView: typeof createOpenTuiView;
  useAsciiGlyphs: () => boolean;
  timers?: CliTimerHandles;
}

const defaultDependencies: CliDependencies = {
  isTty: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  createRenderer: createCliRenderer,
  createApp: createWordleApp,
  createView: createOpenTuiView,
  useAsciiGlyphs: () => process.env.WORDLE_ASCII === '1',
  timers: {
    setInterval: (handler, ms) => setInterval(handler, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  },
};

export async function run(
  argv = process.argv.slice(2),
  overrides: Partial<CliDependencies> = {},
): Promise<CliRuntime> {
  const dependencies = { ...defaultDependencies, ...overrides };
  if (!dependencies.isTty()) {
    throw new Error('This game requires an interactive terminal (TTY).');
  }

  let renderer: CliRenderer | null = null;
  try {
    renderer = await dependencies.createRenderer({
      screenMode: 'alternate-screen',
      exitOnCtrlC: false,
      clearOnShutdown: true,
      consoleMode: 'disabled',
      // Mouse tracking takes over terminal text selection; most terminals bypass it with Shift.
      useMouse: true,
      backgroundColor: '#0f1115',
    });

    const activeRenderer = renderer;
    const app = dependencies.createApp({
      language: parseLanguage(argv),
      effects: {
        copyText: (text) => activeRenderer.copyToClipboardOSC52(text),
      },
    });
    let stopped = false;
    let tickHandle: unknown = null;
    const timers = dependencies.timers ?? defaultDependencies.timers!;

    const render = (): void => {
      if (stopped || activeRenderer.isDestroyed) return;
      view.render(app.snapshot());
    };

    const onTick = (): void => {
      if (stopped || activeRenderer.isDestroyed) return;
      app.onTick();
      render();
    };

    const resolveContext = (): ResolveContext => {
      const snapshot = app.snapshot();
      return {
        view: snapshot.view,
        status: snapshot.game.status,
        introPending: snapshot.introPending,
        noticeVisible: Boolean(snapshot.notice),
      };
    };

    const dispatch = (action: Action): void => {
      const result = app.dispatch(action);
      if (result.shouldQuit) {
        shutdown();
        return;
      }
      render();
      if (action.type === 'openTips') {
        // Ranking is cooperative for large cold pools; repaint when it completes.
        void app.flushTips().then(render);
      }
    };

    const onKeypress = (key: KeyEvent): void => {
      dispatch(resolveOpenTuiKey(resolveContext(), key));
    };

    const onPointer = (target: PointerTarget): void => {
      dispatch(resolvePointer(resolveContext(), target));
    };

    const view = dependencies.createView(activeRenderer, {
      glyphs: dependencies.useAsciiGlyphs() ? 'ascii' : 'unicode',
      onPointer,
    });

    const onPaste = (event: PasteEvent): void => {
      app.dispatch({ type: 'paste', text: decodePasteBytes(event.bytes) });
      render();
    };

    const onResize = (): void => render();

    const detach = (): void => {
      activeRenderer.keyInput.off('keypress', onKeypress);
      activeRenderer.keyInput.off('paste', onPaste);
      activeRenderer.off(CliRenderEvents.RESIZE, onResize);
      activeRenderer.off(CliRenderEvents.DESTROY, onDestroyed);
      if (tickHandle != null) {
        timers.clearInterval(tickHandle);
        tickHandle = null;
      }
    };

    const onDestroyed = (): void => {
      if (stopped) return;
      stopped = true;
      detach();
    };

    const shutdown = (): void => {
      if (stopped) return;
      stopped = true;
      detach();
      view.destroy();
      if (!activeRenderer.isDestroyed) activeRenderer.destroy();
    };

    activeRenderer.keyInput.on('keypress', onKeypress);
    activeRenderer.keyInput.on('paste', onPaste);
    activeRenderer.on(CliRenderEvents.RESIZE, onResize);
    activeRenderer.on(CliRenderEvents.DESTROY, onDestroyed);
    tickHandle = timers.setInterval(onTick, COUNTDOWN_TICK_MS);
    render();

    return { renderer: activeRenderer, app, view, shutdown };
  } catch (error) {
    if (renderer && !renderer.isDestroyed) renderer.destroy();
    throw error;
  }
}
