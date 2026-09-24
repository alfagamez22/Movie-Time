import 'dotenv/config';

import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const couchbase = require('couchbase');
const logPath = process.env.COUCHBASE_MIGRATION_AUDIT_LOG?.trim()
  || new URL('../couchbase-migration-audit.log', import.meta.url);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function quoted(value) {
  return `\`${value.replaceAll('`', '``')}\``;
}

async function main() {
  const bucketName = required('COUCHBASE_BUCKET');
  const scopeName = process.env.COUCHBASE_SCOPE?.trim() || '_default';
  const keyspace = `${quoted(bucketName)}.${quoted(scopeName)}.${quoted('_default')}`;
  const indexes = [
    ['idx_papiflix_user_email', ['type', 'email']],
    ['idx_papiflix_account_provider', ['type', 'provider', 'providerAccountId']],
    ['idx_papiflix_user_updated', ['type', 'userId', 'updatedAt']],
    ['idx_papiflix_user_watched', ['type', 'userId', 'watchedAt']],
    ['idx_papiflix_record_user_media', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType']],
    ['idx_papiflix_progress_episode', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType', 'season', 'episode']],
    ['idx_papiflix_anime_list', ['type', 'userId', 'anilistId', 'updatedAt']],
    ['idx_papiflix_comment_media', ['type', 'mediaId', 'mediaType', 'mediaProvider', 'createdAt']],
  ];

  const cluster = await couchbase.connect(required('COUCHBASE_CONNECTION_STRING'), {
    username: required('COUCHBASE_USERNAME'),
    password: required('COUCHBASE_PASSWORD'),
    configProfile: 'wanDevelopment',
  });

  try {
    const statements = indexes.map(([name, fields]) =>
      `CREATE INDEX ${quoted(name)} IF NOT EXISTS ON ${keyspace} (${fields.map(quoted).join(', ')});`);
    const collection = cluster.bucket(bucketName).scope(scopeName).collection('_default');
    const previous = await collection.queryIndexes().getAllIndexes();
    const existingNames = new Set(previous.map((index) => index.name));

    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      const name = indexes[index][0];
      await cluster.query(statement);
      appendFileSync(logPath,
        `\n[${new Date().toISOString()}] Papiflix Couchbase index setup\n` +
        `Statement: ${statement}\n` +
        `Keyspace: ${bucketName}.${scopeName}._default\n` +
        `Result: completed; ${existingNames.has(name) ? 'index already existed' : 'index created'}\n`);
      console.log(`${name}: statement completed`);
    }

    const names = indexes.map(([name]) => name);
    await collection.queryIndexes().watchIndexes(names, 120_000);
    console.log(`Online indexes verified: ${names.length}`);
  } finally {
    await cluster.close();
  }
}

main().catch((error) => {
  console.error('Couchbase index setup failed:', error.name || 'Error');
  process.exitCode = 1;
});
