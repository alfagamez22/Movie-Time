import 'dotenv/config';
import couchbase from 'couchbase';

const required = (name) => {
  const value = process.env[name]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};
const cluster = await couchbase.connect(required('COUCHBASE_CONNECTION_STRING'), {
  username: required('COUCHBASE_USERNAME'), password: required('COUCHBASE_PASSWORD'), configProfile: 'wanDevelopment',
});
try {
  const bucket = cluster.bucket(required('COUCHBASE_BUCKET'));
  const scopeName = process.env.COUCHBASE_SCOPE?.trim() || '_default';
  try { await bucket.collections().createCollection('feedback', scopeName); }
  catch (error) { if (error.name !== 'CollectionExistsError') throw error; }
  const collection = bucket.scope(scopeName).collection('feedback');
  await collection.queryIndexes().createIndex('idx_feedback_created', ['type', 'createdAt'], { ignoreIfExists: true });
  await collection.queryIndexes().watchIndexes(['idx_feedback_created'], 120000);
  console.log(`${bucket.name}.${scopeName}.feedback: collection and index ready`);
} finally { await cluster.close(); }
