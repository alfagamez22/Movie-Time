import 'dotenv/config';
import couchbase from 'couchbase';
import { INDEXES } from './couchbase-layout.mjs';
const required = (name) => {
  const value = process.env[name]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};
const cluster = await couchbase.connect(required('COUCHBASE_CONNECTION_STRING'), { username: required('COUCHBASE_USERNAME'), password: required('COUCHBASE_PASSWORD'), configProfile: 'wanDevelopment' });
try {
  const bucket = cluster.bucket(required('COUCHBASE_BUCKET'));
  const scopeName = process.env.COUCHBASE_SCOPE?.trim() || '_default';
  try { await bucket.collections().createCollection('announcements', scopeName); }
  catch (error) { if (error.name !== 'CollectionExistsError') throw error; }
  const collection = bucket.scope(scopeName).collection('announcements');
  for (const [name, fields] of INDEXES.announcements) await collection.queryIndexes().createIndex(name, fields, { ignoreIfExists: true });
  await collection.queryIndexes().watchIndexes(INDEXES.announcements.map(([name]) => name), 120000);
  console.log(`${bucket.name}.${scopeName}.announcements: collection and indexes ready; no announcement was published.`);
} finally { await cluster.close(); }
