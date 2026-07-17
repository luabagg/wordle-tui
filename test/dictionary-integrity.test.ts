import { describe, expect, test } from 'bun:test';
import { normalizeWord } from '../src/game';
import enAllList from '../src/dict/en/all.json';
import enAnswers from '../src/dict/en/answers.json';
import ptAllWords from '../src/dict/pt/all.json';
import ptAnswers from '../src/dict/pt/answers.json';

const KEY_PATTERN = /^[a-z]{5}$/;

interface AnswerEntry {
  key: string;
  text: string;
}

function assertNoDuplicateKeys(keys: string[], label: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  expect(duplicates.size, `${label} has duplicate keys: ${[...duplicates].slice(0, 5).join(', ')}`).toBe(0);
}

function assertAnswerBank(
  language: 'en' | 'pt',
  acceptedKeys: string[],
  answers: AnswerEntry[],
  floors: { accepted: number; answers: number },
): void {
  expect(acceptedKeys.length).toBeGreaterThanOrEqual(floors.accepted);
  expect(answers.length).toBeGreaterThanOrEqual(floors.answers);
  expect(acceptedKeys.length).toBeGreaterThan(0);
  expect(answers.length).toBeGreaterThan(0);

  for (const key of acceptedKeys) {
    expect(key, `${language} accepted key "${key}"`).toMatch(KEY_PATTERN);
    expect(normalizeWord(key)).toBe(key);
  }
  assertNoDuplicateKeys(acceptedKeys, `${language} accepted`);

  const acceptedSet = new Set(acceptedKeys);
  const answerKeys: string[] = [];

  for (const entry of answers) {
    expect(entry.key, `${language} answer key`).toMatch(KEY_PATTERN);
    expect(normalizeWord(entry.text)).toBe(entry.key);
    expect(acceptedSet.has(entry.key), `${language} answer ${entry.key} missing from accepted set`).toBe(true);
    answerKeys.push(entry.key);
  }

  assertNoDuplicateKeys(answerKeys, `${language} answers`);
}

describe('dictionary integrity', () => {
  test('English banks have valid normalized keys and answer membership', () => {
    const accepted = enAllList as string[];
    const answers = enAnswers as AnswerEntry[];
    assertAnswerBank('en', accepted, answers, { accepted: 10000, answers: 2000 });
  });

  test('Portuguese banks have valid normalized keys and answer membership', () => {
    const acceptedMap = ptAllWords as Record<string, string>;
    const accepted = Object.keys(acceptedMap);
    const answers = ptAnswers as AnswerEntry[];

    for (const [key, text] of Object.entries(acceptedMap)) {
      expect(key).toMatch(KEY_PATTERN);
      expect(normalizeWord(text)).toBe(key);
    }

    assertAnswerBank('pt', accepted, answers, { accepted: 10000, answers: 1500 });
  });
});
