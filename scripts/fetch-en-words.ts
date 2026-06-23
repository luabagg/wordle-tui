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

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/dict/en');
  await fs.mkdir(outDir, { recursive: true });

  const allWords = new Set<string>();
  const answers = new Set<string>();

  // Wordle guess list (all valid 5-letter words)
  const guessUrl = 'https://raw.githubusercontent.com/3b1b/videos/master/_2022/wordle/data/allowed_words.txt';
  const guesses = await fetchWordleList(guessUrl);
  for (const w of guesses) allWords.add(w);

  // Curated Wordle answer list
  const answerUrl = 'https://raw.githubusercontent.com/3b1b/videos/master/_2022/wordle/data/possible_words.txt';
  const answerList = await fetchWordleList(answerUrl);
  for (const w of answerList) {
    allWords.add(w);
    answers.add(w);
  }

  if (allWords.size === 0) {
    throw new Error('No English words could be fetched. Aborting.');
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
