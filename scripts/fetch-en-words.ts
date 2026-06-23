import fs from 'node:fs/promises';
import path from 'node:path';

const WORD_LENGTH = 5;

const guessUrl = 'https://raw.githubusercontent.com/tabatkins/wordle-list/main/words';
const answerUrl = 'https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/c46f451920d5cf6326d550fb2d6abb1642717852/wordle-answers-alphabetical.txt';

function normalize(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

async function fetchList(url: string): Promise<string[]> {
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

async function findProjectRoot(start: string): Promise<string> {
  let dir = start;
  while (true) {
    try {
      await fs.access(path.join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        throw new Error('Could not locate project root (no package.json found)');
      }
      dir = parent;
    }
  }
}

async function main() {
  const rootDir = await findProjectRoot(__dirname);
  const outDir = path.resolve(rootDir, 'src/dict/en');
  await fs.mkdir(outDir, { recursive: true });

  const guesses = new Set(await fetchList(guessUrl));
  const answers = (await fetchList(answerUrl)).filter((w) => guesses.has(w));

  for (const w of answers) {
    guesses.add(w);
  }

  if (guesses.size === 0) {
    throw new Error('No English words could be fetched. Aborting.');
  }

  const allSorted = Array.from(guesses).sort();
  const answersSorted = Array.from(new Set(answers)).sort();

  await fs.writeFile(
    path.join(outDir, 'all.json'),
    JSON.stringify(allSorted, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(outDir, 'answers.json'),
    JSON.stringify(answersSorted.map((key) => ({ key, text: key })), null, 2) + '\n'
  );

  console.log(`English: ${allSorted.length} guesses, ${answersSorted.length} answers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
