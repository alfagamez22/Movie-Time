import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDbClient() {
  const filename = resolve(__dirname, '..', 'lib/db/client.ts');
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  class FakePrismaClient {}
  class FakePrismaPg {}

  const runtimeModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === '@prisma/adapter-pg') {
      return { PrismaPg: FakePrismaPg };
    }
    if (specifier === '@/lib/generated/prisma/client') {
      return { PrismaClient: FakePrismaClient };
    }
    throw new Error(`Unexpected import while loading db client: ${specifier}`);
  };

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, require, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

test('database client import does not require DATABASE_URL during module discovery', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const { prisma } = loadDbClient();
    assert.ok(prisma);
    assert.throws(
      () => prisma.user,
      /DATABASE_URL is not configured/,
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
