import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const WORD_LENGTH = 5;

function normalize(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function projectRoot(): string {
  let dir = __dirname;
  while (!fsSync.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find project root');
    dir = parent;
  }
  return dir;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const root = projectRoot();
  const outDir = path.join(root, 'src/dict/en');
  await fs.mkdir(outDir, { recursive: true });

  const guessText = await fetchText('https://raw.githubusercontent.com/tabatkins/wordle-list/main/words');
  const commonText = await fs.readFile(path.join(root, 'node_modules/word-list/words.txt'), 'utf8');

  const guesses = new Set(
    guessText
      .split(/\r?\n/)
      .map(normalize)
      .filter((w) => w.length === WORD_LENGTH)
  );

  const commonWords = new Set(
    commonText
      .split(/\r?\n/)
      .map(normalize)
      .filter((w) => w.length === WORD_LENGTH)
  );

  if (guesses.size === 0) throw new Error('No English guesses fetched.');
  if (commonWords.size === 0) throw new Error('No common English words loaded.');

  const allSorted = Array.from(guesses).sort();
  const answers = allSorted.filter((w) => commonWords.has(w));

  if (answers.length === 0) throw new Error('No English answers generated.');

  await fs.writeFile(
    path.join(outDir, 'all.json'),
    JSON.stringify(allSorted, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(outDir, 'answers.json'),
    JSON.stringify(answers.map((key) => ({ key, text: key })), null, 2) + '\n'
  );

  console.log(`English: ${allSorted.length} guesses, ${answers.length} answers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
