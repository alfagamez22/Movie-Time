import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTsModule(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const runtimeModule = { exports: {} };
  const require = (specifier) => {
    throw new Error(`Unexpected import while loading ${relativePath}: ${specifier}`);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, require, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

const userActions = loadTsModule('lib/media/user-actions.ts');

test('bookmark status labels use completed language', () => {
  assert.equal(userActions.BOOKMARK_STATUS_LABELS.favorite, 'Favorite');
  assert.equal(userActions.BOOKMARK_STATUS_LABELS.watched, 'Completed');
  assert.equal(userActions.BOOKMARK_STATUS_LABELS.plan_to_watch, 'Plan to Watch');
});

test('auth prompt copy explains the blocked action', () => {
  assert.deepEqual(userActions.getAuthPromptCopy('bookmark'), {
    title: 'Sign in to bookmark shows',
    description: 'Log in or create an account to bookmark your favorite shows and manage your watch list.',
  });
  assert.deepEqual(userActions.getAuthPromptCopy('comment'), {
    title: 'Sign in to comment',
    description: 'Log in or create an account to comment on films and shows with your profile.',
  });
});

test('comment validation returns trimmed text for valid comments', () => {
  assert.deepEqual(userActions.validateCommentBody('  This movie holds up.  '), {
    ok: true,
    value: 'This movie holds up.',
  });
});

test('comment validation rejects empty and oversized comments', () => {
  assert.deepEqual(userActions.validateCommentBody('   '), {
    ok: false,
    error: 'Write a comment before posting.',
  });
  assert.deepEqual(userActions.validateCommentBody('a'.repeat(1001)), {
    ok: false,
    error: 'Keep comments under 1000 characters.',
  });
});
