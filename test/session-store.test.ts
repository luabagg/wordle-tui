import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  atomicWriteFile,
  atomicWriteJson,
  hasActiveProgress,
  normalizeActivePuzzle,
  readJsonDocument,
} from '../src/session-store';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordle-session-'));
  tempDirs.push(dir);
  return dir;
}

describe('atomicWriteFile', () => {
  test('writes content via same-directory temp + rename', () => {
    const dir = tempDir();
    const file = path.join(dir, 'state.json');
    atomicWriteFile(file, '{"ok":true}\n');
    expect(fs.readFileSync(file, 'utf8')).toBe('{"ok":true}\n');
    const leftovers = fs.readdirSync(dir).filter((name) => name.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  test('keeps a last-known-good backup of the previous primary', () => {
    const dir = tempDir();
    const file = path.join(dir, 'state.json');
    atomicWriteJson(file, { v: 1 });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))).toEqual({ v: 1 });
    atomicWriteJson(file, { v: 2 });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ v: 2 });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))).toEqual({ v: 1 });
  });
});

describe('readJsonDocument', () => {
  test('reports missing files without inventing data', () => {
    const dir = tempDir();
    const file = path.join(dir, 'missing.json');
    expect(readJsonDocument(file)).toEqual({ value: null, status: 'missing' });
  });

  test('parses valid JSON from the primary file', () => {
    const dir = tempDir();
    const file = path.join(dir, 'ok.json');
    atomicWriteJson(file, { hello: 'world' });
    const result = readJsonDocument(file);
    expect(result.status).toBe('ok');
    expect(result.value).toEqual({ hello: 'world' });
    expect(result.warning).toBeUndefined();
  });

  test('distinguishes truncated JSON as malformed', () => {
    const dir = tempDir();
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{"gamesPlayed":1');
    const result = readJsonDocument(file);
    expect(result.status).toBe('malformed');
    expect(result.value).toBeNull();
    expect(result.warning).toMatch(/unreadable/i);
  });

  test('recovers from last-known-good backup when primary is corrupt', () => {
    const dir = tempDir();
    const file = path.join(dir, 'state.json');
    atomicWriteJson(file, { good: true });
    fs.writeFileSync(file, '{not-json');
    const result = readJsonDocument(file);
    expect(result.status).toBe('recovered');
    expect(result.source).toBe('backup');
    expect(result.value).toEqual({ good: true });
    expect(result.warning).toMatch(/backup/i);
  });
});

describe('normalizeActivePuzzle', () => {
  test('accepts a valid partial active puzzle', () => {
    const puzzle = normalizeActivePuzzle({
      dailyId: 'en:2026-07-16',
      language: 'en',
      guesses: ['slate'],
      evaluations: [['absent', 'absent', 'present', 'absent', 'present']],
      slots: [null, null, 'a', null, null],
      cursorPosition: 3,
      status: 'playing',
      hardMode: false,
      mode: 'daily',
    });
    expect(puzzle).toMatchObject({
      dailyId: 'en:2026-07-16',
      language: 'en',
      guesses: ['slate'],
      cursorPosition: 3,
      status: 'playing',
      slots: [null, null, 'a', null, null],
    });
  });

  test('rejects missing daily id or language', () => {
    expect(normalizeActivePuzzle({ language: 'en', status: 'playing', guesses: [] })).toBeNull();
    expect(normalizeActivePuzzle({ dailyId: 'x', status: 'playing', guesses: [] })).toBeNull();
  });
});

describe('hasActiveProgress', () => {
  test('detects guesses, slots, and finished status', () => {
    expect(hasActiveProgress({
      guesses: [],
      slots: [null, null, null, null, null],
      status: 'playing',
    })).toBe(false);
    expect(hasActiveProgress({
      guesses: [],
      slots: [null, 'a', null, null, null],
      status: 'playing',
    })).toBe(true);
    expect(hasActiveProgress({
      guesses: ['slate'],
      slots: [null, null, null, null, null],
      status: 'playing',
    })).toBe(true);
    expect(hasActiveProgress({
      guesses: ['crane'],
      slots: [null, null, null, null, null],
      status: 'won',
    })).toBe(true);
  });
});
