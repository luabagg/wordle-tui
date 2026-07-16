import {
  CliRenderEvents,
  createCliRenderer,
} from '@opentui/core';
import type { CliRenderer, CliRendererConfig, KeyEvent } from '@opentui/core';
import { createWordleApp, parseLanguage } from './app';
import type { WordleApp } from './app';
import { resolveOpenTuiKey } from './input';
import { createOpenTuiView } from './opentui-view';
import type { OpenTuiView } from './opentui-view';

export interface CliRuntime {
  readonly renderer: CliRenderer;
  readonly app: WordleApp;
  readonly view: OpenTuiView;
  shutdown(): void;
}

export interface CliDependencies {
  isTty: () => boolean;
  createRenderer: (config: CliRendererConfig) => Promise<CliRenderer>;
  createApp: typeof createWordleApp;
  createView: typeof createOpenTuiView;
}

const defaultDependencies: CliDependencies = {
  isTty: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  createRenderer: createCliRenderer,
  createApp: createWordleApp,
  createView: createOpenTuiView,
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
      useMouse: false,
      backgroundColor: '#0f1115',
    });

    const activeRenderer = renderer;
    const app = dependencies.createApp({
      language: parseLanguage(argv),
      effects: {
        copyText: (text) => activeRenderer.copyToClipboardOSC52(text),
      },
    });
    const view = dependencies.createView(activeRenderer);
    let stopped = false;

    const render = (): void => {
      if (stopped || activeRenderer.isDestroyed) return;
      view.render(app.snapshot());
    };

    const onKeypress = (key: KeyEvent): void => {
      const snapshot = app.snapshot();
      const action = resolveOpenTuiKey({
        view: snapshot.view,
        status: snapshot.game.status,
        introPending: snapshot.introPending,
      }, key);
      const result = app.dispatch(action);
      if (result.shouldQuit) {
        shutdown();
        return;
      }
      render();
    };

    const onResize = (): void => render();

    const detach = (): void => {
      activeRenderer.keyInput.off('keypress', onKeypress);
      activeRenderer.off(CliRenderEvents.RESIZE, onResize);
      activeRenderer.off(CliRenderEvents.DESTROY, onDestroyed);
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
    activeRenderer.on(CliRenderEvents.RESIZE, onResize);
    activeRenderer.on(CliRenderEvents.DESTROY, onDestroyed);
    render();

    return { renderer: activeRenderer, app, view, shutdown };
  } catch (error) {
    if (renderer && !renderer.isDestroyed) renderer.destroy();
    throw error;
  }
}
