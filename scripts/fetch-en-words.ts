#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const WORD_LENGTH = 5;

function normalize(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

async function fetchWordleList(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map(normalize)
    .filter((w) => w.length === WORD_LENGTH);
}

async function fetchWithFallback(
  primaryUrl: string,
  fallbackUrls: string[]
): Promise<string[]> {
  const urls = [primaryUrl, ...fallbackUrls];
  let lastErr: unknown;

  for (const url of urls) {
    try {
      const words = await fetchWordleList(url);
      console.log(`Fetched ${words.length} words from ${url}`);
      return words;
    } catch (err) {
      lastErr = err;
      console.error(`Warning: could not fetch ${url}: ${err}`);
    }
  }

  throw lastErr;
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/dict/en');
  await fs.mkdir(outDir, { recursive: true });

  const allWords = new Set<string>();
  const answers = new Set<string>();

  // Wordle guess list
  const guessUrl = 'https://raw.githubusercontent.com/tabatkins/wordle-list/main/list.txt';
  const guessFallbackUrls = [
    'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt',
  ];
  try {
    const guesses = await fetchWithFallback(guessUrl, guessFallbackUrls);
    for (const w of guesses) allWords.add(w);
  } catch (err) {
    console.error(`Warning: could not fetch any guess list: ${err}`);
  }

  // Curated answer list
  const answerUrl = 'https://raw.githubusercontent.com/Kinkelin/WordleCompetition/main/data/words.txt';
  try {
    const answerList = await fetchWordleList(answerUrl);
    for (const w of answerList) {
      allWords.add(w);
      answers.add(w);
    }
  } catch (err) {
    console.error(`Warning: could not fetch answer list: ${err}`);
  }

  if (allWords.size === 0) {
    throw new Error('No English words could be fetched. Aborting.');
  }

  // If no curated answers were fetched, derive them from the guess list.
  if (answers.size === 0) {
    const derivedAnswers = Array.from(allWords).slice(0, 2000);
    for (const w of derivedAnswers) answers.add(w);
    console.log(`Derived ${derivedAnswers.length} answers from guess list`);
  }

  const allSorted = Array.from(allWords).sort();
  const answersSorted = Array.from(answers).sort();

  await fs.writeFile(
    path.join(outDir, 'all.json'),
    JSON.stringify(allSorted, null, 2)
  );
  await fs.writeFile(
    path.join(outDir, 'answers.json'),
    JSON.stringify(answersSorted.map((key) => ({ key, text: key })), null, 2)
  );

  console.log(`English: ${allSorted.length} guesses, ${answersSorted.length} answers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
