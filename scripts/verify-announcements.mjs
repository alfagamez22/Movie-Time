import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import couchbase from 'couchbase';
const env = (name) => process.env[name]?.trim().replace(/^(['"])(.*)\1$/, '$2');
const quote = (value) => `\`${value.replaceAll('`', '``')}\``;
const cluster = await couchbase.connect(env('COUCHBASE_CONNECTION_STRING'), { username: env('COUCHBASE_USERNAME'), password: env('COUCHBASE_PASSWORD'), configProfile: 'wanDevelopment' });
try {
  const bucket = cluster.bucket(env('COUCHBASE_BUCKET'));
  const scope = bucket.scope(env('COUCHBASE_SCOPE') || '_default');
  const collection = scope.collection('announcements');
  const keyspace = `${quote(bucket.name)}.${quote(scope.name)}.\`announcements\``;
  const type = `verification-${randomUUID()}`;
  const keys = [];
  const start = '2000-01-01T00:00:00.000Z'; const end = '2000-01-02T00:00:00.000Z';
  try {
    for (const [id, state, publishAt, expiresAt] of [['active','published',start,end], ['draft','draft',start,end], ['scheduled','published',end,'2000-01-03T00:00:00.000Z']]) {
      const key = `${type}::${id}`; keys.push(key);
      await collection.insert(key, { id, type, state, publishAt, expiresAt, title: 'Verification only', description: 'Not public', hasBanner: false, bannerData: 'private', authorId: 'private', createdAt: start }, { expiry: 60 });
    }
    const statement = `SELECT d.id, d.title, d.description, d.publishAt, d.expiresAt, d.hasBanner FROM ${keyspace} d WHERE d.type = $type AND d.state = "published" AND d.publishAt <= $now AND d.expiresAt > $now ORDER BY d.publishAt DESC, d.id LIMIT 20`;
    const query = (now, recordType = type) => cluster.query(statement, { parameters: { now, type: recordType }, scanConsistency: couchbase.QueryScanConsistency.RequestPlus });
    assert.equal((await query('1999-12-31T23:59:59.999Z')).rows.length, 0);
    const active = (await query(start)).rows;
    assert.deepEqual(active.map((row) => row.id), ['active']);
    assert.equal(active[0].authorId, undefined); assert.equal(active[0].bannerData, undefined);
    assert.deepEqual((await query(end)).rows.map((row) => row.id), ['scheduled']);
    await query(new Date().toISOString(), 'announcement');
    await cluster.query(`SELECT d.id, d.title, d.state FROM ${keyspace} d WHERE d.type = "announcement" ORDER BY d.createdAt DESC, d.id LIMIT 21 OFFSET $offset`, { parameters: { offset: 0 } });
    console.log('Database checks passed: scheduled/start/expiry/draft filtering, public field projection and dashboard query.');
  } finally { await Promise.all(keys.map((key) => collection.remove(key).catch(() => undefined))); }
} finally { await cluster.close(); }
const base = 'http://localhost:3011';
for (const [path, method] of [['/api/admin/announcements','GET'], ['/api/admin/announcements','POST'], [`/api/admin/announcements/${randomUUID()}`,'PUT']]) {
  const response = await fetch(`${base}${path}`, { method }); assert.equal(response.status, 403);
}
const publicResponse = await fetch(`${base}/api/announcements`); assert.equal(publicResponse.status, 200);
assert.ok(Array.isArray((await publicResponse.json()).posts));
const bannerResponse = await fetch(`${base}/api/announcements/${randomUUID()}/banner`); assert.equal(bannerResponse.status, 404);
console.log('HTTP checks passed: public delivery and admin access restrictions. No visitor announcement was published.');
