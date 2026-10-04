import { normalizeWord } from './game';
import type { GameStatus } from './game';

export type View = 'game' | 'help' | 'progress' | 'tips' | 'confirmRestart';

export type Action =
  | { type: 'quit' }
  | { type: 'restart' }
  | { type: 'confirmRestart' }
  | { type: 'cancelRestart' }
  | { type: 'dismissNotice' }
  | { type: 'share' }
  | { type: 'openHelp' }
  | { type: 'openProgress' }
  | { type: 'openTips' }
  | { type: 'switchLanguage' }
  | { type: 'toggleHardMode' }
  | { type: 'togglePractice' }
  | { type: 'undo' }
  | { type: 'backToGame' }
  | { type: 'dismissIntro' }
  | { type: 'submit' }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'paste'; text: string }
  | { type: 'useTip'; word: string }
  | { type: 'moveCursor'; offset: number }
  | { type: 'setCursor'; position: number | 'end' }
  | { type: 'type'; char: string }
  | { type: 'noop' };

export interface ResolveContext {
  view: View;
  status: GameStatus;
  introPending: boolean;
  /** When true, Escape dismisses the rollover/status notice instead of quitting. */
  noticeVisible?: boolean;
}

/** What a left click landed on, as reported by the view. */
export type PointerTarget =
  | { kind: 'letter'; char: string }
  | { kind: 'enter' }
  | { kind: 'backspace' }
  | { kind: 'slot'; index: number }
  | { kind: 'tip'; word: string };

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

/**
 * `?` opens help. Ctrl+H cannot be used: terminals send it as 0x08, which
 * OpenTUI parses as Backspace.
 */
export function isHelpCommand(key: Pick<KeyLike, 'ctrl' | 'meta' | 'sequence'>): boolean {
  return !key.ctrl && !key.meta && key.sequence === '?';
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

export function isHardModeToggleCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return Boolean(key.ctrl && key.name === 'd');
}

export function isPracticeToggleCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return Boolean(key.ctrl && key.name === 't');
}

export function isUndoCommand(key: Pick<KeyLike, 'ctrl' | 'name'>): boolean {
  return Boolean(key.ctrl && key.name === 'z');
}

export function resolveKey(context: ResolveContext, str: string, key: KeyLike): Action {
  const { view, status, introPending } = context;

  if (key.ctrl && (key.name === 'c' || key.name === 'q')) return { type: 'quit' };

  if (view === 'confirmRestart') {
    if (key.name === 'escape') return { type: 'cancelRestart' };
    if (key.name === 'return' || key.name === 'enter') return { type: 'confirmRestart' };
    if (str && !key.ctrl && !key.meta) {
      const ch = str.toLowerCase();
      if (ch === 'y') return { type: 'confirmRestart' };
      if (ch === 'n') return { type: 'cancelRestart' };
    }
    return { type: 'noop' };
  }

  if (view === 'help') {
    if (introPending || key.name === 'escape' || isHelpCommand({ ...key, sequence: str })) {
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

  if (isHelpCommand({ ...key, sequence: str })) return { type: 'openHelp' };
  if (key.ctrl && key.name === 'p') return { type: 'openProgress' };
  if (isLanguageSwitchCommand(key)) return { type: 'switchLanguage' };
  if (isHardModeToggleCommand(key)) return { type: 'toggleHardMode' };
  if (isPracticeToggleCommand(key)) return { type: 'togglePractice' };
  if (isUndoCommand(key)) return { type: 'undo' };
  if (isTipsCommand(key)) return { type: 'openTips' };
  // Prefer dismiss-notice over quit when Esc is pressed while a notice is shown.
  if (context.noticeVisible && key.name === 'escape' && !key.ctrl) {
    return { type: 'dismissNotice' };
  }
  if (isQuitCommand(key, status)) return { type: 'quit' };
  if (introPending) return { type: 'dismissIntro' };
  if (isRestartCommand(key, status)) return { type: 'restart' };
  if (isShareCommand(key, status)) return { type: 'share' };

  if (key.name === 'return' || key.name === 'enter') return { type: 'submit' };
  if (key.name === 'backspace') return { type: 'backspace' };
  if (key.name === 'delete') return { type: 'delete' };
  if (key.name === 'left') return { type: 'moveCursor', offset: -1 };
  if (key.name === 'right') return { type: 'moveCursor', offset: 1 };
  if (key.name === 'home') return { type: 'setCursor', position: 0 };
  if (key.name === 'end') return { type: 'setCursor', position: 'end' };
  if (str && !key.ctrl && !key.meta) return { type: 'type', char: str };

  return { type: 'noop' };
}

/**
 * Map a click to an action. Clicks act only on the editable game row or the
 * tips list. They never reach shortcut handling, so a click on the R key types
 * a letter and never restarts.
 */
export function resolvePointer(context: ResolveContext, target: PointerTarget): Action {
  if (context.view === 'tips') {
    return target.kind === 'tip' ? { type: 'useTip', word: target.word } : { type: 'noop' };
  }
  if (context.view !== 'game' || context.introPending || context.status !== 'playing') {
    return { type: 'noop' };
  }

  switch (target.kind) {
    case 'letter':
      return { type: 'type', char: target.char };
    case 'enter':
      return { type: 'submit' };
    case 'backspace':
      return { type: 'backspace' };
    case 'slot':
      return { type: 'setCursor', position: target.index };
    case 'tip':
      return { type: 'noop' };
  }
}

export function resolveOpenTuiKey(context: ResolveContext, key: KeyLike): Action {
  const name = key.name?.toLowerCase();
  const sequence = key.sequence || '';
  const char = sequence.length === 1 ? sequence : '';
  return resolveKey(context, char, { ...key, name });
}

/** Accept exactly one five-letter word after accent normalization. */
export function isValidPasteWord(text: string): boolean {
  if (!text || /\s/.test(text)) return false;
  return /^[a-z]{5}$/.test(normalizeWord(text));
}
