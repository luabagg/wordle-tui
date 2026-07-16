import type { Language } from './i18n';
import type { WordEntry } from './game';
import ptAllWords from './dict/pt/all.json';
import ptAnswers from './dict/pt/answers.json';
import enAllList from './dict/en/all.json';
import enAnswers from './dict/en/answers.json';

export interface WordBank {
  language: Language;
  allWords: Readonly<Record<string, string>>;
  answers: readonly WordEntry[];
}

function toWordMap(words: readonly string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const word of words) {
    map[word] = word;
  }
  return map;
}

const ptBank: WordBank = {
  language: 'pt',
  allWords: ptAllWords,
  answers: ptAnswers,
};

const enBank: WordBank = {
  language: 'en',
  allWords: toWordMap(enAllList as readonly string[]),
  answers: enAnswers,
};

export function loadWordBank(language: Language = 'pt'): WordBank {
  if (language === 'pt') return ptBank;
  if (language === 'en') return enBank;
  throw new Error(`Unsupported language: ${language}`);
}

export function defaultLanguage(): Language {
  return 'pt';
}
