import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

test('session resolution never blocks the entire PapiFlix app', () => {
  assert.doesNotMatch(layoutSource, /SessionBootstrap/);
  assert.match(layoutSource, /<SessionProvider\s+refetchOnWindowFocus=\{false\}\s+refetchWhenOffline=\{false\}>/);
  assert.match(layoutSource, /<SessionProvider[^>]*>\s*\{children\}\s*<\/SessionProvider>/s);
});
