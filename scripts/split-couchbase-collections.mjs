import 'dotenv/config';

import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { collectionForRecord, COLLECTIONS, INDEXES } from './couchbase-layout.mjs';

const require = createRequire(import.meta.url);
const couchbase = require('couchbase');
const TYPES = ['user', 'account', 'session', 'verificationToken', 'bookmark', 'watchHistory', 'watchProgress', 'mediaComment', 'papiAnimeProgress'];
const auditPath = process.env.COUCHBASE_MIGRATION_AUDIT_LOG?.trim() || new URL('../couchbase-migration-audit.log', import.meta.url);

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalized(child)]));
  return value;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const cluster = await couchbase.connect(env('COUCHBASE_CONNECTION_STRING'), {
    username: env('COUCHBASE_USERNAME'), password: env('COUCHBASE_PASSWORD'), configProfile: 'wanDevelopment',
  });
  try {
    const bucket = cluster.bucket(env('COUCHBASE_BUCKET'));
    const scopeName = process.env.COUCHBASE_SCOPE?.trim() || '_default';
    const scope = bucket.scope(scopeName);
    const snapshot = [];
    for (const type of TYPES) {
      const statement = `SELECT META(d).id AS documentKey, d AS document FROM \`${bucket.name}\`.\`${scopeName}\`.\`_default\` AS d WHERE d.type = $type`;
      const result = await cluster.query(statement, { parameters: { type }, scanConsistency: couchbase.QueryScanConsistency.RequestPlus });
      appendFileSync(auditPath, `\n[${new Date().toISOString()}] ${statement} (type=${type})\nResult: ${result.rows.length} records\n`);
      snapshot.push(...result.rows);
    }
    const counts = Object.fromEntries(COLLECTIONS.map((name) => [name, 0]));
    for (const row of snapshot) counts[collectionForRecord(row.document.type, row.document)]++;
    console.log('Source:', snapshot.length, 'documents; destination plan:', JSON.stringify(counts));
    if (!apply) return;

    const manager = bucket.collections();
    const existing = new Set((await manager.getAllScopes()).find((item) => item.name === scopeName)?.collections.map((item) => item.name) || []);
    for (const name of COLLECTIONS) {
      if (!existing.has(name)) {
        await manager.createCollection(name, scopeName);
        appendFileSync(auditPath, `\n[${new Date().toISOString()}] createCollection ${bucket.name}.${scopeName}.${name}\nResult: created\n`);
      }
    }
    for (const name of COLLECTIONS) {
      const collection = scope.collection(name);
      for (const [indexName, fields] of INDEXES[name]) {
        await collection.queryIndexes().createIndex(indexName, fields, { ignoreIfExists: true });
        appendFileSync(auditPath, `\n[${new Date().toISOString()}] createIndex ${bucket.name}.${scopeName}.${name}.${indexName} (${fields.join(', ')})\nResult: exists or created\n`);
      }
    }
    let copied = 0;
    for (const row of snapshot) {
      const name = collectionForRecord(row.document.type, row.document);
      const target = scope.collection(name);
      try {
        await target.insert(row.documentKey, row.document);
        copied++;
      } catch (error) {
        if (!(error instanceof couchbase.DocumentExistsError)) throw error;
      }
      const result = await target.get(row.documentKey);
      if (JSON.stringify(normalized(result.content)) !== JSON.stringify(normalized(row.document))) {
        throw new Error(`Destination differs from source: ${name}/${row.documentKey}`);
      }
    }
    appendFileSync(auditPath, `\n[${new Date().toISOString()}] collection split\nSource: ${bucket.name}.${scopeName}._default\nDestinations: ${JSON.stringify(counts)}\nResult: ${snapshot.length} documents verified; ${copied} inserted. Legacy source retained.\n`);
    console.log('Verified:', snapshot.length, 'documents;', copied, 'inserted. Legacy _default retained.');
  } finally {
    await cluster.close();
  }
}

main().catch((error) => { console.error('Collection split failed:', error.name, error.message); process.exitCode = 1; });
