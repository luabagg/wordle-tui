import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTips } from '../src/tips';

test('renderTips includes candidate count and top suggestions', () => {
  const lines = renderTips({
    language: 'en',
    candidates: ['apple', 'apply', 'apron'],
    ranked: [
      { guess: 'apple', entropy: 2.5, topPattern: 'CCCCC', topPatternCount: 1 },
      { guess: 'apply', entropy: 1.5, topPattern: 'CCCCA', topPatternCount: 1 },
    ],
    bestCandidate: 'apple',
    width: 80,
  });
  const text = lines.join('\n');
  assert.match(text, /3 candidates/);
  assert.match(text, /APPLE/);
  assert.match(text, /2\.50 bits/);
});

test('renderTips handles empty candidates', () => {
  const lines = renderTips({
    language: 'en',
    candidates: [],
    ranked: [],
    bestCandidate: null,
    width: 80,
  });
  const text = lines.join('\n');
  assert.match(text, /0 candidates/);
});

test('renderTips is localized for Portuguese', () => {
  const lines = renderTips({
    language: 'pt',
    candidates: ['termo', 'tempo'],
    ranked: [{ guess: 'termo', entropy: 1, topPattern: 'CCCCC', topPatternCount: 1 }],
    bestCandidate: 'termo',
    width: 80,
  });
  const text = lines.join('\n');
  assert.match(text, /candidatos/);
});
