import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameStateResponse, createSession } from '../src/mcp';
import { createGame } from '../src/game';

test('buildGameStateResponse returns serializable state', () => {
  const game = createGame({ answer: 'hello', dictionary: { hello: 'hello' }, language: 'en' });
  const state = buildGameStateResponse(game);
  assert.equal(state.status, 'playing');
  assert.equal(state.grid.length, 6);
  assert.equal(state.language, 'en');
  assert.ok(Array.isArray(state.keyboard));
});

test('createSession starts an English game', async () => {
  const session = await createSession('en');
  assert.equal(session.game.state.language, 'en');
  assert.equal(session.game.state.status, 'playing');
  assert.ok(session.enBank.language === 'en');
  assert.ok(session.ptBank.language === 'pt');
});

test('createSession starts a Portuguese game', async () => {
  const session = await createSession('pt');
  assert.equal(session.game.state.language, 'pt');
});
