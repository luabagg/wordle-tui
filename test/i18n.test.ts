import test from 'node:test';
import assert from 'node:assert/strict';
import { messages } from '../src/i18n';

test('messages exist for en and pt', () => {
  assert.equal(messages.en.notInDictionary, 'Not in dictionary.');
  assert.equal(messages.pt.notInDictionary, 'Não conheço essa palavra.');
});
