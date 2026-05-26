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
  const fn = new Function('exports', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

const oauth = loadTsModule('lib/auth/oauth.ts');

test('reads Auth.js Google OAuth variables first', () => {
  assert.deepEqual(
    oauth.getGoogleOAuthCredentials({
      AUTH_GOOGLE_ID: ' auth-id ',
      AUTH_GOOGLE_SECRET: ' auth-secret ',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
    }),
    { clientId: 'auth-id', clientSecret: 'auth-secret' },
  );
});

test('falls back to Google client variable names from the Cloud Console', () => {
  assert.deepEqual(
    oauth.getGoogleOAuthCredentials({
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
    }),
    { clientId: 'google-id', clientSecret: 'google-secret' },
  );
});

test('does not enable Google OAuth unless both values are present', () => {
  assert.equal(oauth.getGoogleOAuthCredentials({ GOOGLE_CLIENT_ID: 'google-id' }), null);
  assert.equal(oauth.getGoogleOAuthCredentials({ GOOGLE_CLIENT_SECRET: 'google-secret' }), null);
  assert.equal(oauth.getGoogleOAuthCredentials({}), null);
});
