import assert from 'node:assert/strict';
import test from 'node:test';

const { hit } = await import(new URL('../lib/rate-limit-core.ts', import.meta.url).pathname);

test('allows requests up to the limit, then blocks until the window resets', () => {
  const key = `t:${Math.random()}`;
  assert.equal(hit(key, 2, 1000, 0).limited, false);
  assert.equal(hit(key, 2, 1000, 10).limited, false);
  const blocked = hit(key, 2, 1000, 20);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(hit(key, 2, 1000, 1001).limited, false);
});

test('keys are independent', () => {
  const a = `a:${Math.random()}`;
  const b = `b:${Math.random()}`;
  hit(a, 1, 1000, 0);
  assert.equal(hit(a, 1, 1000, 1).limited, true);
  assert.equal(hit(b, 1, 1000, 1).limited, false);
});
