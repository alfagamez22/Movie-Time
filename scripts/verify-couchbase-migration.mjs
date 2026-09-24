import 'dotenv/config';

import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Pool } from 'pg';

const require = createRequire(import.meta.url);
const couchbase = require('couchbase');
const logPath = process.env.COUCHBASE_MIGRATION_AUDIT_LOG?.trim()
  || new URL('../couchbase-migration-audit.log', import.meta.url);
const MODELS = [
  ['User', 'user'],
  ['Account', 'account'],
  ['Session', 'session'],
  ['Bookmark', 'bookmark'],
  ['WatchHistory', 'watchHistory'],
  ['WatchProgress', 'watchProgress'],
  ['MediaComment', 'mediaComment'],
  ['PapiAnimeProgress', 'papiAnimeProgress'],
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(normalize(value));
}

async function main() {
  const source = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const cluster = await couchbase.connect(required('COUCHBASE_CONNECTION_STRING'), {
    username: required('COUCHBASE_USERNAME'),
    password: required('COUCHBASE_PASSWORD'),
    configProfile: 'wanDevelopment',
  });
  let total = 0;
  let mismatches = 0;

  try {
    const collection = cluster.bucket(required('COUCHBASE_BUCKET'))
      .scope(process.env.COUCHBASE_SCOPE?.trim() || '_default').collection('_default');

    for (const [table, type] of MODELS) {
      const rows = (await source.query(`SELECT * FROM "${table}"`)).rows;
      let modelMismatches = 0;
      for (const row of rows) {
        const id = String(row.id);
        const key = `${type}::${encodeURIComponent(id)}`;
        try {
          const result = await collection.get(key);
          const expected = { ...row, id, type };
          if (stableJson(result.content) !== stableJson(expected)) modelMismatches += 1;
        } catch (error) {
          if (error instanceof couchbase.DocumentNotFoundError) modelMismatches += 1;
          else throw error;
        }
      }

      total += rows.length;
      mismatches += modelMismatches;
      console.log(`${type}: ${rows.length - modelMismatches}/${rows.length} records match`);
    }

    appendFileSync(logPath,
      `\n[${new Date().toISOString()}] Papiflix Couchbase migration verification\n` +
      'Operation: collection.get(docKey) compared with source Postgres document fields\n' +
      `Keyspace: ${required('COUCHBASE_BUCKET')}.${process.env.COUCHBASE_SCOPE?.trim() || '_default'}._default\n` +
      `Result: ${total - mismatches}/${total} source records match; mismatches=${mismatches}\n`);
    console.log(`TOTAL: ${total - mismatches}/${total} records match; mismatches=${mismatches}`);
    if (mismatches > 0) process.exitCode = 1;
  } finally {
    await source.end();
    await cluster.close();
  }
}

main().catch((error) => {
  console.error('Migration verification failed:', error.name || 'Error');
  process.exitCode = 1;
});
