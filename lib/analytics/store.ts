import { getCouchbase } from '@/lib/db/couchbase';

export const ANALYTICS_COLLECTION = 'analytics';
export const LIVE_WINDOW_MS = 60_000;
const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const MAX_HEARTBEAT_GAP_SECONDS = 45;

export interface WatchSession {
  city: string | null;
  country: string | null;
  device: string;
  email: string | null;
  episode: string | null;
  experience: string;
  id: string;
  ip: string | null;
  isAdmin: boolean;
  lastSeenAt: string;
  mediaId: string;
  mediaType: string;
  name: string | null;
  posterUrl: string | null;
  provider: string;
  region: string | null;
  season: string | null;
  startedAt: string;
  title: string;
  type: 'watch_session';
  userAgent: string;
  userId: string | null;
  visitorId: string;
  watchSeconds: number;
}

type CouchbaseState = typeof globalThis & { papiflixAnalyticsReady?: Promise<void> };
const globalState = globalThis as CouchbaseState;

async function ensureCollection() {
  if (!globalState.papiflixAnalyticsReady) {
    globalState.papiflixAnalyticsReady = (async () => {
      const { bucket, scope } = await getCouchbase();
      try {
        await bucket.collections().createCollection(ANALYTICS_COLLECTION, scope.name, { maxExpiry: RETENTION_SECONDS });
      } catch (error) {
        if (!(error instanceof Error && error.name === 'CollectionExistsError')) {
          console.error('Analytics collection setup failed', { error: error instanceof Error ? error.name : 'UnknownError' });
        }
      }
    })();
  }
  return globalState.papiflixAnalyticsReady;
}

async function analytics() {
  await ensureCollection();
  const couchbase = await getCouchbase();
  const keyspace = `\`${couchbase.bucket.name}\`.\`${couchbase.scope.name}\`.\`${ANALYTICS_COLLECTION}\``;
  return { ...couchbase, collection: couchbase.scope.collection(ANALYTICS_COLLECTION), keyspace };
}

function sessionKey(id: string) {
  return `watch_session::${encodeURIComponent(id)}`;
}

export type HeartbeatInput = Omit<WatchSession, 'id' | 'lastSeenAt' | 'startedAt' | 'type' | 'watchSeconds'> & {
  sessionId: string;
};

export async function recordHeartbeat({ sessionId, ...input }: HeartbeatInput): Promise<void> {
  const { collection } = await analytics();
  const key = sessionKey(sessionId);
  const now = new Date();
  let existing: WatchSession | null = null;
  try {
    existing = (await collection.get(key)).content as WatchSession;
  } catch (error) {
    if (!(error instanceof Error && error.name === 'DocumentNotFoundError')) throw error;
  }

  const sameViewer = existing && existing.visitorId === input.visitorId;
  const elapsed = sameViewer
    ? Math.min(MAX_HEARTBEAT_GAP_SECONDS, Math.max(0, (now.getTime() - Date.parse(existing!.lastSeenAt)) / 1000))
    : 0;

  const document: WatchSession = {
    ...input,
    id: sessionId,
    lastSeenAt: now.toISOString(),
    startedAt: sameViewer ? existing!.startedAt : now.toISOString(),
    type: 'watch_session',
    watchSeconds: Math.round((sameViewer ? existing!.watchSeconds : 0) + elapsed),
  };
  await collection.upsert(key, document, { expiry: RETENTION_SECONDS });
}

export interface SessionQuery {
  country?: string;
  experience?: string;
  includeAdmin?: boolean;
  limit?: number;
  search?: string;
  signedIn?: 'yes' | 'no';
  since?: Date;
  userId?: string;
}

export async function querySessions(query: SessionQuery = {}): Promise<WatchSession[]> {
  const { cluster, keyspace } = await analytics();
  const where = ['d.type = "watch_session"'];
  const parameters: Record<string, string | number> = {};

  if (query.since) {
    where.push('d.lastSeenAt >= $since');
    parameters.since = query.since.toISOString();
  }
  if (!query.includeAdmin) where.push('d.isAdmin = false');
  if (query.userId) {
    where.push('d.userId = $userId');
    parameters.userId = query.userId;
  }
  if (query.country) {
    where.push('d.country = $country');
    parameters.country = query.country.toUpperCase();
  }
  if (query.experience) {
    where.push('d.experience = $experience');
    parameters.experience = query.experience;
  }
  if (query.signedIn === 'yes') where.push('d.userId IS VALUED');
  if (query.signedIn === 'no') where.push('d.userId IS NOT VALUED');
  if (query.search) {
    where.push('(CONTAINS(LOWER(IFMISSINGORNULL(d.email, "")), $search) OR CONTAINS(LOWER(d.title), $search) OR CONTAINS(IFMISSINGORNULL(d.ip, ""), $search))');
    parameters.search = query.search.toLowerCase();
  }
  parameters.limit = Math.min(Math.max(1, query.limit ?? 300), 5000);

  const statement = `SELECT d.* FROM ${keyspace} AS d WHERE ${where.join(' AND ')} ORDER BY d.lastSeenAt DESC LIMIT $limit`;
  const result = await cluster.query<WatchSession>(statement, { parameters });
  return result.rows;
}

export async function getLiveSessions(includeAdmin = false) {
  return querySessions({ includeAdmin, limit: 500, since: new Date(Date.now() - LIVE_WINDOW_MS) });
}

export async function countUsers(): Promise<number> {
  const { bucket, cluster, scope } = await getCouchbase();
  const result = await cluster.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM \`${bucket.name}\`.\`${scope.name}\`.\`identity\` AS d WHERE d.type = "user"`,
  );
  return result.rows[0]?.total ?? 0;
}
