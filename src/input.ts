import type { GameStatus } from './game';

export type View = 'game' | 'help' | 'progress' | 'tips';

export type Action =
  | { type: 'quit' }
  | { type: 'restart' }
  | { type: 'share' }
  | { type: 'openHelp' }
  | { type: 'openProgress' }
  | { type: 'openTips' }
  | { type: 'switchLanguage' }
  | { type: 'backToGame' }
  | { type: 'dismissIntro' }
  | { type: 'submit' }
  | { type: 'backspace' }
  | { type: 'moveCursor'; offset: number }
  | { type: 'setCursor'; position: number | 'end' }
  | { type: 'type'; char: string }
  | { type: 'noop' };

export interface ResolveContext {
  view: View;
  status: GameStatus;
  introPending: boolean;
}

export interface KeyLike {
  name?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  sequence?: string;
}

export function isQuitCommand(key: Pick<KeyLike, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return (Boolean(key.ctrl) && (key.name === 'c' || key.name === 'q'))
    || key.name === 'escape'
    || (status !== 'playing' && key.name === 'q');
}

export function isRestartCommand(key: Pick<KeyLike, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return (Boolean(key.ctrl) && key.name === 'r') || (status !== 'playing' && key.name === 'r');
}

export function isHelpCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return Boolean(key.ctrl && key.name === 'h');
}

export function isProgressCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return Boolean(key.ctrl && key.name === 'p');
}

export function isBackCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return !key.ctrl && key.name === 'escape';
}

export function isShareCommand(key: Pick<KeyLike, 'ctrl' | 'name'>, status: GameStatus): boolean {
  return status !== 'playing' && !key.ctrl && key.name === 's';
}

export function isLanguageSwitchCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return Boolean(key.ctrl && key.name === 'l');
}

export function isTipsCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return !key.ctrl && key.name === 'tab';
}

export function resolveKey(context: ResolveContext, str: string, key: KeyLike): Action {
  const { view, status, introPending } = context;

  if (key.ctrl && (key.name === 'c' || key.name === 'q')) return { type: 'quit' };

  if (view === 'help') {
    if (introPending || key.name === 'escape' || (key.ctrl && key.name === 'h')) {
      return { type: introPending ? 'dismissIntro' : 'backToGame' };
    }
    return { type: 'noop' };
  }

  if (view === 'progress') {
    if (key.name === 'escape' || (key.ctrl && key.name === 'p')) return { type: 'backToGame' };
    return { type: 'noop' };
  }

  if (view === 'tips') {
    if (key.name === 'escape' || key.name === 'tab') return { type: 'backToGame' };
    return { type: 'noop' };
  }

  if (key.ctrl && key.name === 'h') return { type: 'openHelp' };
  if (key.ctrl && key.name === 'p') return { type: 'openProgress' };
  if (isLanguageSwitchCommand(key)) return { type: 'switchLanguage' };
  if (isTipsCommand(key)) return { type: 'openTips' };
  if (isQuitCommand(key, status)) return { type: 'quit' };
  if (introPending) return { type: 'dismissIntro' };
  if (isRestartCommand(key, status)) return { type: 'restart' };
  if (isShareCommand(key, status)) return { type: 'share' };

  if (key.name === 'return' || key.name === 'enter') return { type: 'submit' };
  if (key.name === 'backspace' || key.name === 'delete') return { type: 'backspace' };
  if (key.name === 'left') return { type: 'moveCursor', offset: -1 };
  if (key.name === 'right') return { type: 'moveCursor', offset: 1 };
  if (key.name === 'home') return { type: 'setCursor', position: 0 };
  if (key.name === 'end') return { type: 'setCursor', position: 'end' };
  if (str && !key.ctrl && !key.meta) return { type: 'type', char: str };

  return { type: 'noop' };
}

export function resolveOpenTuiKey(context: ResolveContext, key: KeyLike): Action {
  const name = key.name?.toLowerCase();
  const sequence = key.sequence || '';
  const char = sequence.length === 1 ? sequence : '';
  return resolveKey(context, char, { ...key, name });
}
