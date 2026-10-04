import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWordleApp } from '../src/app';
import type { WordBank } from '../src/dictionary';
import { defaultStats, loadStatsResult, saveStats } from '../src/stats';

const banks: Record<'en' | 'pt', WordBank> = {
  en: {
    language: 'en',
    allWords: { crane: 'crane', slate: 'slate' },
    answers: [{ key: 'crane', text: 'crane' }],
  },
  pt: {
    language: 'pt',
    allWords: { termo: 'termo', texto: 'texto' },
    answers: [{ key: 'termo', text: 'termo' }],
  },
};

function typeWord(app: ReturnType<typeof createWordleApp>, word: string): void {
  for (const char of word) app.dispatch({ type: 'type', char });
}

/** Combined controller + real atomic filesystem persistence rollover coverage. */
test('persisted active board survives rollover archive and restores the new day', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wordle-rollover-integration-'));
  const file = path.join(directory, 'stats.json');
  let now = new Date('2026-07-16T23:59:00Z');
  const stats = defaultStats();
  stats.introSeen = true;

  try {
    const app = createWordleApp({
      language: 'en',
      banks,
      stats,
      effects: {
        now: () => now,
        saveStats: (value) => saveStats(value, file),
        copyText: () => false,
      },
    });
    typeWord(app, 'slate');
    app.dispatch({ type: 'submit' });
    const oldDailyId = app.snapshot().daily.id;

    let disk = loadStatsResult(file).stats;
    expect(disk.activeByLanguage.en?.dailyId).toBe(oldDailyId);
    expect(disk.activeByLanguage.en?.guesses).toEqual(['slate']);

    now = new Date('2026-07-17T00:01:00Z');
    app.onTick(now);
    const newDailyId = app.snapshot().daily.id;
    expect(newDailyId).not.toBe(oldDailyId);

    disk = loadStatsResult(file).stats;
    expect(disk.archivedActive[oldDailyId]?.guesses).toEqual(['slate']);
    expect(disk.activeByLanguage.en).toBeUndefined();

    const relaunched = createWordleApp({
      language: 'en',
      banks,
      stats: disk,
      effects: {
        now: () => now,
        saveStats: (value) => saveStats(value, file),
        copyText: () => false,
      },
    });
    relaunched.dispatch({ type: 'type', char: 'c' });

    const finalDisk = loadStatsResult(file).stats;
    expect(finalDisk.archivedActive[oldDailyId]?.guesses).toEqual(['slate']);
    expect(finalDisk.activeByLanguage.en?.dailyId).toBe(newDailyId);
    expect(finalDisk.activeByLanguage.en?.slots[0]).toBe('c');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
