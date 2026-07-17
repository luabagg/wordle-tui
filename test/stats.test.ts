import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { createGame, TILE } from '../src/game';
import {
  buildShareText,
  defaultStats,
  distributionRows,
  loadStats,
  loadStatsResult,
  recordDailyResult,
  saveStats,
  STATS_SCHEMA_VERSION,
} from '../src/stats';
import {
  dailyDateKey,
  dailyDescriptor,
  dailyPuzzleNumber,
  formatNextDailyCountdown,
  secondsUntilNextDaily,
} from '../src/words';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempStatsPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordle-stats-'));
  tempDirs.push(dir);
  return path.join(dir, 'stats.json');
}

test('buildShareText renders Termo-style result for Portuguese', () => {
  const game = createGame({ answer: 'termo', dictionary: ['sábio', 'termo'], language: 'pt' });
  for (const ch of 'sabio') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  assert.equal(buildShareText(game.state, 1634, 1), [
    'joguei term.ooo #1634 *2/6 🔥 1',
    '',
    '⬛⬛⬛⬛🟩',
    '🟩🟩🟩🟩🟩',
  ].join('\n'));
});

test('buildShareText renders Wordle-style result for English', () => {
  const game = createGame({ answer: 'crane', dictionary: ['slate', 'crane'], language: 'en' });
  for (const ch of 'slate') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  for (const ch of 'crane') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  assert.equal(buildShareText(game.state, 1800, 3), [
    'Wordle 1800 2/6',
    '',
    '⬛⬛🟩⬛🟩',
    '🟩🟩🟩🟩🟩',
  ].join('\n'));
});

test('buildShareText provides an explicitly requested ASCII fallback', () => {
  const game = createGame({ answer: 'crane', dictionary: ['crane'], language: 'en' });
  for (const ch of 'crane') game.addLetter(ch);
  expect(game.submitGuess()).toBe(true);
  const share = buildShareText(game.state, 1800, 0, { glyphs: 'ascii' });
  expect(share).toContain('GGGGG');
  expect(share).not.toContain('🟩');
});

test('recordDailyResult stores one result per daily puzzle', () => {
  const stats = defaultStats();
  const game = createGame({ answer: 'termo', dictionary: ['termo'], language: 'pt' });
  for (const ch of 'termo') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  const first = recordDailyResult(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
  const second = recordDailyResult(stats, game.state, { id: 'pt:2026-06-24', number: 1632 });
  assert.equal(first.recorded, true);
  assert.equal(second.recorded, false);
  assert.equal(stats.gamesPlayed, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.distribution[1], 1);
});

test('recordDailyResult tracks losses and resets the streak', () => {
  const stats = defaultStats();
  const game = createGame({
    answer: 'termo',
    dictionary: ['texto', 'sabio', 'torso', 'torre', 'torta', 'tordo', 'termo'],
    language: 'pt',
  });
  for (const word of ['texto', 'sabio', 'torso', 'torre', 'torta', 'tordo']) {
    for (const ch of word) game.addLetter(ch);
    assert.equal(game.submitGuess(), true);
  }
  assert.equal(game.state.status, 'lost');
  const result = recordDailyResult(stats, game.state, { id: 'pt:2026-06-25', number: 1633 });
  assert.equal(result.recorded, true);
  assert.equal(stats.gamesPlayed, 1);
  assert.equal(stats.wins, 0);
  assert.equal(stats.losses, 1);
  assert.equal(stats.currentStreak, 0);
  assert.match(distributionRows(stats).join('\n'), /☠/);
});

test('Portuguese daily calendar uses America/Sao_Paulo midnight', () => {
  const date = new Date('2026-06-24T21:30:00-03:00');
  assert.equal(dailyPuzzleNumber('pt', date), 1632);
  assert.equal(secondsUntilNextDaily('pt', date), 9_000);
  assert.equal(formatNextDailyCountdown(9_000), '2h 30m');
});

test('English daily calendar uses UTC midnight', () => {
  const date = new Date('2026-06-24T21:30:00Z');
  assert.equal(secondsUntilNextDaily('en', date), 9_000);
  assert.equal(dailyDateKey('en', date), '2026-06-24');
  assert.ok(dailyPuzzleNumber('en', date) > 0);
});

test('daily descriptors are language-scoped', () => {
  const date = new Date('2026-06-24T12:00:00Z');
  const en = dailyDescriptor('en', date);
  const pt = dailyDescriptor('pt', date);
  assert.equal(en.id, 'en:2026-06-24');
  assert.equal(pt.id, 'pt:2026-06-24');
  assert.notEqual(en.id, pt.id);
  assert.equal(en.number, dailyPuzzleNumber('en', date));
  assert.equal(pt.number, dailyPuzzleNumber('pt', date));
});

test('share text uses yellow and green tiles for present and correct letters', () => {
  const game = createGame({ answer: 'crane', dictionary: ['trace', 'crane'], language: 'en' });
  for (const ch of 'trace') game.addLetter(ch);
  assert.equal(game.submitGuess(), true);
  const row = game.state.evaluations[0];
  // TRACE vs CRANE → t absent, r correct, a correct, c present, e correct
  assert.deepEqual(row, [TILE.ABSENT, TILE.CORRECT, TILE.CORRECT, TILE.PRESENT, TILE.CORRECT]);
  assert.match(buildShareText(game.state, 10, 0), /⬛🟩🟩🟨🟩/);
});

describe('atomic stats persistence', () => {
  test('missing file loads defaults without warning', () => {
    const file = tempStatsPath();
    const result = loadStatsResult(file);
    expect(result.stats).toEqual(defaultStats());
    expect(result.warning).toBeUndefined();
  });

  test('round-trips schemaVersion and active sessions atomically', () => {
    const file = tempStatsPath();
    const stats = defaultStats();
    stats.introSeen = true;
    stats.gamesPlayed = 2;
    stats.wins = 1;
    stats.losses = 1;
    stats.activeByLanguage.en = {
      dailyId: 'en:2026-07-16',
      language: 'en',
      guesses: ['slate'],
      evaluations: [[TILE.ABSENT, TILE.ABSENT, TILE.PRESENT, TILE.ABSENT, TILE.PRESENT]],
      slots: [null, null, 'c', null, null],
      cursorPosition: 3,
      status: 'playing',
      hardMode: false,
      mode: 'daily',
    };
    saveStats(stats, file);

    const loaded = loadStatsResult(file);
    expect(loaded.warning).toBeUndefined();
    expect(loaded.stats.schemaVersion).toBe(STATS_SCHEMA_VERSION);
    expect(loaded.stats.gamesPlayed).toBe(2);
    expect(loaded.stats.activeByLanguage.en?.guesses).toEqual(['slate']);
    expect(loaded.stats.activeByLanguage.en?.slots).toEqual([null, null, 'c', null, null]);
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).gamesPlayed).toBe(2);

    stats.gamesPlayed = 3;
    saveStats(stats, file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).gamesPlayed).toBe(3);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).gamesPlayed).toBe(2);
  });

  test('malformed primary recovers from backup and preserves completed results', () => {
    const file = tempStatsPath();
    const stats = defaultStats();
    stats.results['en:2026-07-15'] = {
      puzzle: 1,
      won: true,
      guesses: 3,
      completedAt: '2026-07-15T12:00:00.000Z',
      shareText: 'Wordle 1 3/6',
    };
    stats.gamesPlayed = 1;
    stats.wins = 1;
    saveStats(stats, file);
    fs.writeFileSync(file, '{"truncated');

    const loaded = loadStatsResult(file);
    expect(loaded.warning).toMatch(/backup/i);
    expect(loaded.stats.results['en:2026-07-15']?.won).toBe(true);
    expect(loaded.stats.gamesPlayed).toBe(1);
  });

  test('truncated JSON without backup yields defaults plus warning', () => {
    const file = tempStatsPath();
    fs.writeFileSync(file, '{"gamesPlayed":');
    const loaded = loadStatsResult(file);
    expect(loaded.stats.gamesPlayed).toBe(0);
    expect(loaded.warning).toMatch(/unreadable/i);
  });

  test('negative counters and wrong types are rejected instead of coerced', () => {
    const file = tempStatsPath();
    fs.writeFileSync(file, JSON.stringify({
      introSeen: true,
      gamesPlayed: -3,
      wins: 'many',
      losses: 1,
      currentStreak: -1,
      maxStreak: 2,
      distribution: { 1: -1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 },
      results: {
        'en:2026-07-16': {
          puzzle: 10,
          won: true,
          guesses: 2,
          completedAt: '2026-07-16T00:00:00.000Z',
          shareText: 'ok',
        },
      },
    }));

    const loaded = loadStatsResult(file);
    expect(loaded.stats.gamesPlayed).toBe(0);
    expect(loaded.stats.wins).toBe(0);
    expect(loaded.stats.currentStreak).toBe(0);
    expect(loaded.stats.distribution[1]).toBe(0);
    expect(loaded.stats.results['en:2026-07-16']?.guesses).toBe(2);
    expect(loaded.warning).toMatch(/invalid/i);
  });

  test('migrates pre-schemaVersion files without dropping completed stats', () => {
    const file = tempStatsPath();
    fs.writeFileSync(file, JSON.stringify({
      introSeen: true,
      gamesPlayed: 4,
      wins: 3,
      losses: 1,
      currentStreak: 2,
      maxStreak: 3,
      distribution: { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0 },
      results: {
        'pt:2026-07-10': {
          puzzle: 1600,
          won: true,
          guesses: 2,
          completedAt: '2026-07-10T12:00:00.000Z',
          shareText: 'share',
        },
      },
    }));

    const loaded = loadStatsResult(file);
    expect(loaded.stats.schemaVersion).toBe(STATS_SCHEMA_VERSION);
    expect(loaded.stats.gamesPlayed).toBe(4);
    expect(loaded.stats.results['pt:2026-07-10']?.puzzle).toBe(1600);
    expect(loaded.stats.activeByLanguage).toEqual({});
    expect(loaded.stats.archivedActive).toEqual({});
    expect(loaded.stats.settings).toEqual({ hardModeDefault: false });

    saveStats(loaded.stats, file);
    const reloaded = loadStats(file);
    expect(reloaded.schemaVersion).toBe(STATS_SCHEMA_VERSION);
    expect(reloaded.results['pt:2026-07-10']?.won).toBe(true);
    expect(reloaded.settings.hardModeDefault).toBe(false);
  });

  test('round-trips hardModeDefault settings under schema v3', () => {
    const file = tempStatsPath();
    const stats = defaultStats();
    stats.settings.hardModeDefault = true;
    saveStats(stats, file);
    const loaded = loadStatsResult(file);
    expect(loaded.stats.schemaVersion).toBe(STATS_SCHEMA_VERSION);
    expect(loaded.stats.settings.hardModeDefault).toBe(true);
  });

  test('leaves interrupted temp siblings alone and still loads primary', () => {
    const file = tempStatsPath();
    const stats = defaultStats();
    stats.introSeen = true;
    saveStats(stats, file);
    fs.writeFileSync(path.join(path.dirname(file), `.stats.json.999.tmp`), '{"partial":true');
    const loaded = loadStatsResult(file);
    expect(loaded.stats.introSeen).toBe(true);
    expect(loaded.warning).toBeUndefined();
  });
});
