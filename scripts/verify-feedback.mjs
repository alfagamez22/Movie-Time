import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import couchbase from 'couchbase';
const env = (name) => process.env[name]?.trim().replace(/^(['"])(.*)\1$/, '$2');
const cluster = await couchbase.connect(env('COUCHBASE_CONNECTION_STRING'), { username: env('COUCHBASE_USERNAME'), password: env('COUCHBASE_PASSWORD'), configProfile: 'wanDevelopment' });
const quote = (value) => `\`${value.replaceAll('`', '``')}\``;
try {
  const bucket = cluster.bucket(env('COUCHBASE_BUCKET'));
  const scope = bucket.scope(env('COUCHBASE_SCOPE') || '_default');
  const root = `${quote(bucket.name)}.${quote(scope.name)}`;
  await cluster.query(`SELECT d.id, d.name, d.email, d.image, d.createdAt FROM ${root}.\`identity\` d WHERE d.type = $type ORDER BY LOWER(IFMISSINGORNULL(d.name, d.email, "")), d.id LIMIT 50 OFFSET $offset`, { parameters: { type: 'user', offset: 0 } });
  await cluster.query(`SELECT d.* FROM ${root}.\`feedback\` d WHERE d.type = $type ORDER BY d.createdAt DESC, d.id LIMIT 50 OFFSET $offset`, { parameters: { type: 'feedback', offset: 0 } });
  const collection = scope.collection('feedback');
  const key = `verification-quota::${randomUUID()}`;
  try {
    const values = await Promise.all(Array.from({ length: 6 }, () => collection.binary().increment(key, 1, { initial: 1, expiry: 60 })));
    assert.deepEqual(values.map((result) => result.value).sort((a,b) => a-b), [1,2,3,4,5,6]);
    assert.equal(values.filter((result) => result.value <= 5).length, 5);
  } finally { await collection.remove(key); }
  console.log('User and feedback dashboard queries passed; concurrent quota permits exactly five of six attempts.');
} finally { await cluster.close(); }
