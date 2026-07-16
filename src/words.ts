import { Language } from './i18n';
import { WordEntry } from './game';

export interface DailyCalendar {
  timeZone: string;
  epochUtcMs: number;
}

export interface DailyDescriptor {
  id: string;
  number: number;
}

const calendars: Record<Language, DailyCalendar> = {
  pt: {
    timeZone: 'America/Sao_Paulo',
    epochUtcMs: Date.UTC(2022, 0, 5),
  },
  en: {
    timeZone: 'UTC',
    epochUtcMs: Date.UTC(2021, 5, 19),
  },
};

export function randomAnswer(words: string[]): string {
  return words[Math.floor(Math.random() * words.length)];
}

function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function daysSinceEpoch(date: Date, language: Language): number {
  const calendar = calendars[language];
  const [year, month, day] = dateKeyInZone(date, calendar.timeZone).split('-').map(Number);
  const today = Date.UTC(year, month - 1, day);
  return Math.floor((today - calendar.epochUtcMs) / 86_400_000);
}

export function dailyDateKey(language: Language = 'pt', date = new Date()): string {
  return dateKeyInZone(date, calendars[language].timeZone);
}

export function dailyPuzzleNumber(language: Language = 'pt', date = new Date()): number {
  return daysSinceEpoch(date, language) + 1;
}

export function secondsUntilNextDaily(language: Language = 'pt', date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: calendars[language].timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour || 0);
  const minute = Number(values.minute || 0);
  const second = Number(values.second || 0);
  const elapsed = hour * 3_600 + minute * 60 + second;
  const remaining = 86_400 - elapsed;
  return remaining === 86_400 ? 0 : remaining;
}

export function formatNextDailyCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function dailyAnswer(
  language: Language,
  answers: readonly WordEntry[],
  date = new Date(),
): WordEntry {
  if (answers.length === 0) {
    throw new Error('answer list cannot be empty');
  }

  const day = daysSinceEpoch(date, language);
  const index = Math.abs(day * 2_654_435_761) % answers.length;
  return answers[index];
}

export function dailyDescriptor(language: Language = 'pt', date = new Date()): DailyDescriptor {
  return {
    id: `${language}:${dailyDateKey(language, date)}`,
    number: dailyPuzzleNumber(language, date),
  };
}
