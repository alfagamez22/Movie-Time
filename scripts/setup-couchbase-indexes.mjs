import 'dotenv/config';

import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { INDEXES } from './couchbase-layout.mjs';

const require = createRequire(import.meta.url);
const couchbase = require('couchbase');
const logPath = process.env.COUCHBASE_MIGRATION_AUDIT_LOG?.trim()
  || new URL('../couchbase-migration-audit.log', import.meta.url);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function main() {
  const bucketName = required('COUCHBASE_BUCKET');
  const scopeName = process.env.COUCHBASE_SCOPE?.trim() || '_default';

  const cluster = await couchbase.connect(required('COUCHBASE_CONNECTION_STRING'), {
    username: required('COUCHBASE_USERNAME'),
    password: required('COUCHBASE_PASSWORD'),
    configProfile: 'wanDevelopment',
  });

  try {
    const scope = cluster.bucket(bucketName).scope(scopeName);
    for (const [collectionName, indexes] of Object.entries(INDEXES)) {
      const collection = scope.collection(collectionName);
      for (const [name, fields] of indexes) {
        await collection.queryIndexes().createIndex(name, fields, { ignoreIfExists: true });
        appendFileSync(logPath,
          `\n[${new Date().toISOString()}] Papiflix Couchbase index setup\n` +
          `Operation: createIndex ${name} (${fields.join(', ')})\n` +
          `Keyspace: ${bucketName}.${scopeName}.${collectionName}\n` +
          'Result: exists or created\n');
        console.log(`${collectionName}.${name}: exists or created`);
      }
      await collection.queryIndexes().watchIndexes(indexes.map(([name]) => name), 120_000);
    }
    console.log('Named collection indexes online.');
  } finally {
    await cluster.close();
  }
}

main().catch((error) => {
  console.error('Couchbase index setup failed:', error.name || 'Error');
  process.exitCode = 1;
});
