import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game';
import { enterTerminalUi, isQuitCommand, isRestartCommand, leaveTerminalUi } from '../src/index';

test('plain q and r are letters during active play', () => {
  assert.equal(isQuitCommand({ name: 'q', ctrl: false }, 'playing'), false);
  assert.equal(isRestartCommand({ name: 'r', ctrl: false }, 'playing'), false);

  const game = createGame({ answer: 'quero', dictionary: ['quero'], language: 'pt' });
  game.addLetter('q');
  game.addLetter('r');
  assert.equal(game.state.currentGuess, 'qr');
});

test('finished games accept q to quit and r to restart', () => {
  assert.equal(isQuitCommand({ name: 'q', ctrl: false }, 'won'), true);
  assert.equal(isRestartCommand({ name: 'r', ctrl: false }, 'lost'), true);
});

test('terminal UI uses the alternate screen buffer', () => {
  assert.match(enterTerminalUi(), /\x1b\[\?1049h/);
  assert.match(leaveTerminalUi(), /\x1b\[\?1049l/);
});
