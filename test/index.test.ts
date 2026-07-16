import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game';
import {
  enterTerminalUi,
  leaveTerminalUi,
  renderGameLines,
  renderHelpLines,
  renderProgressLines,
} from '../src/render';
import {
  isBackCommand,
  isHelpCommand,
  isLanguageSwitchCommand,
  isProgressCommand,
  isQuitCommand,
  isRestartCommand,
  isShareCommand,
  resolveOpenTuiKey,
} from '../src/input';
import { defaultStats, recordDailyResult } from '../src/stats';

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

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

test('ctrl shortcuts open help and progress while plain keys stay available', () => {
  assert.equal(isHelpCommand({ name: 'h', ctrl: true }), true);
  assert.equal(isHelpCommand({ name: 'h', ctrl: false }), false);
  assert.equal(isProgressCommand({ name: 'p', ctrl: true }), true);
  assert.equal(isProgressCommand({ name: 'p', ctrl: false }), false);
  assert.equal(isBackCommand({ name: 'escape', ctrl: false }), true);
});

test('share command only works after a round ends', () => {
  assert.equal(isShareCommand({ name: 's', ctrl: false }, 'playing'), false);
  assert.equal(isShareCommand({ name: 's', ctrl: false }, 'won'), true);
  assert.equal(isShareCommand({ name: 's', ctrl: true }, 'won'), false);
});

test('language switch uses Ctrl+L and leaves plain L free', () => {
  assert.equal(isLanguageSwitchCommand({ name: 'l', ctrl: true }), true);
  assert.equal(isLanguageSwitchCommand({ name: 'l', ctrl: false }), false);
});

test('terminal UI uses the alternate screen buffer', () => {
  assert.match(enterTerminalUi(), /\x1b\[\?1049h/);
  assert.match(leaveTerminalUi(), /\x1b\[\?1049l/);
});

test('rendered board stays centered at a normal terminal width', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  const lines = renderGameLines(game, 80);
  const boardLine = lines.find((line: string) => /T\s+E\s+R\s+M\s+O/.test(stripAnsi(line)));

  assert.ok(boardLine);
  assert.ok(boardLine.match(/^ */)![0].length >= 20);
  assert.ok(stripAnsi(boardLine).length <= 80);
});

test('empty tiles render as painted cells without bracket placeholders', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  const text = renderGameLines(game, 80).map(stripAnsi).join('\n');

  assert.doesNotMatch(text, /\[[ A-Z]?\]/);
  assert.match(text, /·/);
});

test('keyboard includes a visible feedback legend', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  const text = renderGameLines(game, 80).map(stripAnsi).join('\n');

  assert.match(text, /Legenda/);
  assert.match(text, /correta/);
  assert.match(text, /existe/);
  assert.match(text, /fora/);
});

test('finished game shows share prompt without result block before sharing', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  const stats = defaultStats();
  recordDailyResult(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
  const text = renderGameLines(game, 80, {
    stats,
    puzzleNumber: 1632,
    nextWordIn: '12h 34m',
  }).map(stripAnsi).join('\n');

  assert.match(text, /Compartilhar: pressione S para copiar/);
  assert.doesNotMatch(text, /Progresso/);
  assert.doesNotMatch(text, /joguei term\.ooo #1632 \*1\/6/);
});

test('finished game shows share block only after share action', () => {
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);

  const stats = defaultStats();
  recordDailyResult(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
  const text = renderGameLines(game, 80, {
    stats,
    puzzleNumber: 1632,
    nextWordIn: '12h 34m',
    shareCopied: true,
  }).map(stripAnsi).join('\n');

  assert.match(text, /Resultado copiado/);
  assert.match(text, /joguei term\.ooo #1632 \*1\/6/);
  assert.match(text, /🟩🟩🟩🟩🟩/);
});

test('progress view renders separately with a back hint and skull row', () => {
  const stats = defaultStats();
  stats.gamesPlayed = 3;
  stats.wins = 2;
  stats.losses = 1;
  stats.currentStreak = 0;
  stats.maxStreak = 2;
  stats.distribution[2] = 1;
  stats.distribution[4] = 1;

  const text = renderProgressLines(stats, 80, '12h 34m').map(stripAnsi).join('\n');

  assert.match(text, /Progresso/);
  assert.match(text, /Próxima palavra em 12h 34m/);
  assert.match(text, /☠/);
  assert.match(text, /Voltar: Esc ou Ctrl\+P/);
});

test('help view can be rendered explicitly', () => {
  const text = renderHelpLines(80).map(stripAnsi).join('\n');

  assert.match(text, /TERMO TUI/);
  assert.match(text, /Ctrl\+H/);
  assert.match(text, /Voltar/);
});

test('rendered game title uses localized strings only', () => {
  const pt = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  const en = createGame({ answer: 'crane', dictionary: ['crane'], language: 'en' });

  const ptText = renderGameLines(pt, 80).map(stripAnsi).join('\n');
  const enText = renderGameLines(en, 80).map(stripAnsi).join('\n');

  assert.match(ptText, /TERMO TUI/);
  assert.doesNotMatch(ptText, /WORDLE TUI/);
  assert.match(enText, /WORDLE TUI/);
});

test('OpenTUI key events map to the existing action contract', () => {
  const context = { view: 'game' as const, status: 'playing' as const, introPending: false };

  assert.deepEqual(resolveOpenTuiKey(context, { name: 'a', sequence: 'a' }), { type: 'type', char: 'a' });
  assert.deepEqual(resolveOpenTuiKey(context, { name: 'enter', sequence: '\r' }), { type: 'submit' });
  assert.deepEqual(resolveOpenTuiKey(context, { name: 'left', sequence: '\u001b[D' }), { type: 'moveCursor', offset: -1 });
  assert.deepEqual(resolveOpenTuiKey(context, { name: 'h', ctrl: true, sequence: '\b' }), { type: 'openHelp' });
  assert.deepEqual(resolveOpenTuiKey(context, { name: 'c', ctrl: true, sequence: '\u0003' }), { type: 'quit' });
});
