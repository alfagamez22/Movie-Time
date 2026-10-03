import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanFeedbackText, validateFeedback } from '../lib/feedback/validation.ts';
const input = { title: 'Improve search', category: 'Others' };
test('normalizes whitespace and invisible input without joining distinct words', () => {
  assert.equal(cleanFeedbackText('  w      o r       d\t\n test  '), 'w o r d test');
  assert.equal(cleanFeedbackText('hello\u200bworld'), 'hello world');
  assert.throws(() => validateFeedback({ ...input, title: '\u200b \t\n' }));
});
test('enforces raw and normalized lengths, types and category allowlist', () => {
  assert.throws(() => validateFeedback({ ...input, title: 'a'.repeat(151) }));
  assert.throws(() => validateFeedback({ ...input, description: ' '.repeat(1001) }));
  assert.throws(() => validateFeedback({ ...input, title: 'ﬃ'.repeat(100) }));
  assert.throws(() => validateFeedback({ ...input, category: 'invented' }));
  assert.throws(() => validateFeedback({ ...input, description: null }));
  assert.throws(() => validateFeedback({ ...input, title: '!!!' }));
  assert.deepEqual(validateFeedback(input), { ...input, description: '' });
  assert.equal(validateFeedback({ ...input, title: 'a'.repeat(150), description: 'b'.repeat(1000) }).description.length, 1000);
});
