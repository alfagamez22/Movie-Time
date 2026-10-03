import { randomUUID } from 'node:crypto';
import { MutateInSpec } from 'couchbase';
import { processAnnouncementBanner } from './banner';
import { getCouchbase } from '@/lib/db/couchbase';
import type { AnnouncementInput, AnnouncementState, PublicAnnouncement } from './validation';

export interface Announcement extends PublicAnnouncement {
  type: 'announcement';
  state: AnnouncementState;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  bannerData: string | null;
}
const quote = (value: string) => `\`${value.replaceAll('`', '``')}\``;
async function database() {
  const { bucket, cluster, scope } = await getCouchbase();
  return { cluster, collection: scope.collection('announcements'), keyspace: `${quote(bucket.name)}.${quote(scope.name)}.\`announcements\`` };
}
export async function listAnnouncements(page = 1) {
  const { cluster, keyspace } = await database();
  const result = await cluster.query<Omit<Announcement, 'bannerData'>>(`SELECT d.id, d.type, d.title, d.description, d.state, d.publishAt, d.expiresAt, d.hasBanner, d.createdAt, d.updatedAt, d.authorId FROM ${keyspace} d WHERE d.type = "announcement" ORDER BY d.createdAt DESC, d.id LIMIT 21 OFFSET $offset`, { parameters: { offset: (page - 1) * 20 }, scanConsistency: 'request_plus' as import('couchbase').QueryScanConsistency });
  return { posts: result.rows.slice(0, 20), hasNext: result.rows.length > 20 };
}
export async function activeAnnouncements() {
  const { cluster, keyspace } = await database();
  const result = await cluster.query<PublicAnnouncement>(`SELECT d.id, d.title, d.description, d.publishAt, d.expiresAt, d.hasBanner FROM ${keyspace} d WHERE d.type = "announcement" AND d.state = "published" AND d.publishAt <= $now AND d.expiresAt > $now ORDER BY d.publishAt DESC, d.id LIMIT 20`, { parameters: { now: new Date().toISOString() }, scanConsistency: 'request_plus' as import('couchbase').QueryScanConsistency });
  return result.rows;
}
export async function readAnnouncement(id: string): Promise<Announcement | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const { collection } = await database();
  try { return (await collection.get(`announcement::${id}`)).content as Announcement; }
  catch (error) { if (error instanceof Error && error.name === 'DocumentNotFoundError') return null; throw error; }
}
export async function saveAnnouncement(input: AnnouncementInput, authorId: string, id?: string) {
  const { collection } = await database();
  const existing = id ? await readAnnouncement(id) : null;
  if (id && !existing) throw new Error('Announcement not found.');
  let bannerData = existing?.bannerData ?? null;
  if (input.bannerData === null) bannerData = null;
  if (input.bannerData) {
    bannerData = await processAnnouncementBanner(input.bannerData);
  }
  const now = new Date().toISOString();
  const post: Announcement = { id: existing?.id ?? randomUUID(), type: 'announcement', title: input.title, description: input.description, state: input.state, publishAt: input.publishAt, expiresAt: input.expiresAt, createdAt: existing?.createdAt ?? now, updatedAt: now, authorId: existing?.authorId ?? authorId, bannerData, hasBanner: Boolean(bannerData) };
  if (existing) await collection.replace(`announcement::${post.id}`, post);
  else await collection.insert(`announcement::${post.id}`, post);
  return post.id;
}

export async function disableAnnouncement(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Announcement not found.');
  const { collection } = await database();
  // Atomic field updates preserve the banner, content and publication window.
  await collection.mutateIn(`announcement::${id}`, [MutateInSpec.replace('state', 'disabled'), MutateInSpec.upsert('updatedAt', new Date().toISOString())]);
  return id;
}

export async function deleteAnnouncement(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Announcement not found.');
  const { collection } = await database();
  // Banner bytes live in this same document and are deleted with the post.
  await collection.remove(`announcement::${id}`);
  return id;
}
