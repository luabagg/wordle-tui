import { expect, test } from 'bun:test';
import {
  isBackCommand,
  isHardModeToggleCommand,
  isHelpCommand,
  isLanguageSwitchCommand,
  isPracticeToggleCommand,
  isProgressCommand,
  isQuitCommand,
  isRestartCommand,
  isShareCommand,
  isUndoCommand,
  resolveOpenTuiKey,
} from '../src/input';

test('plain q and r remain letters during active play', () => {
  expect(isQuitCommand({ name: 'q', ctrl: false }, 'playing')).toBe(false);
  expect(isRestartCommand({ name: 'r', ctrl: false }, 'playing')).toBe(false);
});

test('finished games accept q to quit and r to restart', () => {
  expect(isQuitCommand({ name: 'q', ctrl: false }, 'won')).toBe(true);
  expect(isRestartCommand({ name: 'r', ctrl: false }, 'lost')).toBe(true);
});

test('ctrl shortcuts preserve their plain-letter equivalents', () => {
  expect(isHelpCommand({ name: 'h', ctrl: true })).toBe(true);
  expect(isHelpCommand({ name: 'h', ctrl: false })).toBe(false);
  expect(isProgressCommand({ name: 'p', ctrl: true })).toBe(true);
  expect(isProgressCommand({ name: 'p', ctrl: false })).toBe(false);
  expect(isLanguageSwitchCommand({ name: 'l', ctrl: true })).toBe(true);
  expect(isLanguageSwitchCommand({ name: 'l', ctrl: false })).toBe(false);
  expect(isBackCommand({ name: 'escape', ctrl: false })).toBe(true);
});

test('share command only works after a round ends', () => {
  expect(isShareCommand({ name: 's', ctrl: false }, 'playing')).toBe(false);
  expect(isShareCommand({ name: 's', ctrl: false }, 'won')).toBe(true);
  expect(isShareCommand({ name: 's', ctrl: true }, 'won')).toBe(false);
});

test('Escape dismisses a visible rollover notice before quitting', () => {
  expect(resolveOpenTuiKey({
    view: 'game',
    status: 'playing',
    introPending: false,
    noticeVisible: true,
  }, { name: 'escape', sequence: '\u001b' })).toEqual({ type: 'dismissNotice' });
});

test('OpenTUI key events map to the action contract', () => {
  const playing = { view: 'game' as const, status: 'playing' as const, introPending: false };

  expect(resolveOpenTuiKey(playing, { name: 'a', sequence: 'a' })).toEqual({ type: 'type', char: 'a' });
  expect(resolveOpenTuiKey(playing, { name: 'return', sequence: '\r' })).toEqual({ type: 'submit' });
  expect(resolveOpenTuiKey(playing, { name: 'left', sequence: '\u001b[D' })).toEqual({ type: 'moveCursor', offset: -1 });
  expect(resolveOpenTuiKey(playing, { name: 'right', sequence: '\u001b[C' })).toEqual({ type: 'moveCursor', offset: 1 });
  expect(resolveOpenTuiKey(playing, { name: 'home', sequence: '\u001b[H' })).toEqual({ type: 'setCursor', position: 0 });
  expect(resolveOpenTuiKey(playing, { name: 'end', sequence: '\u001b[F' })).toEqual({ type: 'setCursor', position: 'end' });
  expect(resolveOpenTuiKey(playing, { name: 'backspace', sequence: '\b' })).toEqual({ type: 'backspace' });
  expect(resolveOpenTuiKey(playing, { name: 'delete', sequence: '\u001b[3~' })).toEqual({ type: 'delete' });
  expect(resolveOpenTuiKey(playing, { name: 'tab', sequence: '\t' })).toEqual({ type: 'openTips' });
  expect(resolveOpenTuiKey(playing, { name: 'h', ctrl: true, sequence: '\b' })).toEqual({ type: 'openHelp' });
  expect(resolveOpenTuiKey(playing, { name: 'p', ctrl: true, sequence: '\u0010' })).toEqual({ type: 'openProgress' });
  expect(resolveOpenTuiKey(playing, { name: 'l', ctrl: true, sequence: '\f' })).toEqual({ type: 'switchLanguage' });
  expect(resolveOpenTuiKey(playing, { name: 'r', ctrl: true, sequence: '\u0012' })).toEqual({ type: 'restart' });
  expect(resolveOpenTuiKey(playing, { name: 'd', ctrl: true, sequence: '\u0004' })).toEqual({ type: 'toggleHardMode' });
  expect(resolveOpenTuiKey(playing, { name: 't', ctrl: true, sequence: '\u0014' })).toEqual({ type: 'togglePractice' });
  expect(resolveOpenTuiKey(playing, { name: 'z', ctrl: true, sequence: '\u001a' })).toEqual({ type: 'undo' });
  expect(isHardModeToggleCommand({ name: 'd', ctrl: true })).toBe(true);
  expect(isPracticeToggleCommand({ name: 't', ctrl: true })).toBe(true);
  expect(isUndoCommand({ name: 'z', ctrl: true })).toBe(true);
  expect(resolveOpenTuiKey(playing, { name: 'escape', sequence: '\u001b' })).toEqual({ type: 'quit' });
  expect(resolveOpenTuiKey(playing, { name: 'c', ctrl: true, sequence: '\u0003' })).toEqual({ type: 'quit' });

  const finished = { ...playing, status: 'won' as const };
  expect(resolveOpenTuiKey(finished, { name: 's', sequence: 's' })).toEqual({ type: 'share' });
  expect(resolveOpenTuiKey(finished, { name: 'r', sequence: 'r' })).toEqual({ type: 'restart' });
  expect(resolveOpenTuiKey(finished, { name: 'q', sequence: 'q' })).toEqual({ type: 'quit' });

  const confirming = { view: 'confirmRestart' as const, status: 'playing' as const, introPending: false };
  expect(resolveOpenTuiKey(confirming, { name: 'y', sequence: 'y' })).toEqual({ type: 'confirmRestart' });
  expect(resolveOpenTuiKey(confirming, { name: 'n', sequence: 'n' })).toEqual({ type: 'cancelRestart' });
  expect(resolveOpenTuiKey(confirming, { name: 'return', sequence: '\r' })).toEqual({ type: 'confirmRestart' });
  expect(resolveOpenTuiKey(confirming, { name: 'escape', sequence: '\u001b' })).toEqual({ type: 'cancelRestart' });
});
