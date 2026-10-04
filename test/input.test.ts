import { describe, expect, test } from 'bun:test';
import { resolvePointer } from '../src/input';
import type { ResolveContext } from '../src/input';

const playing: ResolveContext = { view: 'game', status: 'playing', introPending: false };

describe('resolvePointer', () => {
  test('maps game clicks to editing actions', () => {
    expect(resolvePointer(playing, { kind: 'letter', char: 'r' })).toEqual({ type: 'type', char: 'r' });
    expect(resolvePointer(playing, { kind: 'enter' })).toEqual({ type: 'submit' });
    expect(resolvePointer(playing, { kind: 'backspace' })).toEqual({ type: 'backspace' });
    expect(resolvePointer(playing, { kind: 'slot', index: 3 })).toEqual({ type: 'setCursor', position: 3 });
  });

  test('never turns a key click into a shortcut after the round', () => {
    const finished: ResolveContext = { ...playing, status: 'won' };
    expect(resolvePointer(finished, { kind: 'letter', char: 'r' })).toEqual({ type: 'noop' });
    expect(resolvePointer(finished, { kind: 'letter', char: 'q' })).toEqual({ type: 'noop' });
    expect(resolvePointer(finished, { kind: 'enter' })).toEqual({ type: 'noop' });
  });

  test('fills a tip only from the tips view', () => {
    expect(resolvePointer({ ...playing, view: 'tips' }, { kind: 'tip', word: 'slate' }))
      .toEqual({ type: 'useTip', word: 'slate' });
    expect(resolvePointer(playing, { kind: 'tip', word: 'slate' })).toEqual({ type: 'noop' });
    expect(resolvePointer({ ...playing, view: 'tips' }, { kind: 'letter', char: 'a' })).toEqual({ type: 'noop' });
  });

  test('ignores clicks in other views and during the intro', () => {
    for (const view of ['help', 'progress', 'confirmRestart'] as const) {
      expect(resolvePointer({ ...playing, view }, { kind: 'letter', char: 'a' })).toEqual({ type: 'noop' });
    }
    expect(resolvePointer({ ...playing, introPending: true }, { kind: 'enter' })).toEqual({ type: 'noop' });
  });
});
