import 'dotenv/config';

import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { collectionForRecord } from './couchbase-layout.mjs';

const require = createRequire(import.meta.url);
const couchbase = require('couchbase');

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
const QUERY_HISTORY_PATH = process.env.COUCHBASE_MIGRATION_AUDIT_LOG?.trim()
  || new URL('../couchbase-migration-audit.log', import.meta.url);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const source = new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 1 });
  let cluster;

  try {
    const snapshot = [];
    for (const [table, type] of MODELS) {
      const result = await source.query(`SELECT * FROM "${table}"`);
      snapshot.push({ table, type, rows: result.rows });
      console.log(`${table}: ${result.rowCount} records`);
    }

    const planned = snapshot.reduce((sum, entry) => sum + entry.rows.length, 0);
    console.log(`Total source records: ${planned}`);
    console.log(`Target: ${requireEnv('COUCHBASE_BUCKET')}.${process.env.COUCHBASE_SCOPE?.trim() || '_default'}.<named collection>`);
    console.log(apply
      ? 'Mode: APPLY (KV upsert each source document by stable model/id key)'
      : 'Mode: DRY RUN (no Couchbase writes; rerun with --apply after approval)');

    if (!apply) return;

    cluster = await couchbase.connect(requireEnv('COUCHBASE_CONNECTION_STRING'), {
      username: requireEnv('COUCHBASE_USERNAME'),
      password: requireEnv('COUCHBASE_PASSWORD'),
      configProfile: 'wanDevelopment',
    });
    const bucket = cluster.bucket(requireEnv('COUCHBASE_BUCKET'));
    const scope = bucket.scope(process.env.COUCHBASE_SCOPE?.trim() || '_default');

    let copied = 0;
    for (const { rows, type } of snapshot) {
      for (const row of rows) {
        const id = String(row.id);
        const key = `${type}::${encodeURIComponent(id)}`;
        const document = { ...normalize(row), id, type };
        const collectionName = collectionForRecord(type, document);
        await scope.collection(collectionName).upsert(key, document);
        appendFileSync(QUERY_HISTORY_PATH,
          `\n[${new Date().toISOString()}] Papiflix data migration\n` +
          `Operation: collection.upsert(docKey, document)\n` +
          `Keyspace: ${bucket.name}.${scope.name}.${collectionName}\n` +
          `Document key: ${key}\n` +
          'Result: 1 document upserted; migration authorized by user request.\n');
        copied += 1;
      }
      console.log(`${type}: copied ${rows.length}`);
    }
    console.log(`Copied ${copied} of ${planned} records.`);
  } finally {
    await source.end();
    if (cluster) await cluster.close();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.name || 'Error');
  process.exitCode = 1;
});
