import type { Bucket, Cluster, Collection, Scope } from 'couchbase';

type CouchbaseState = typeof globalThis & {
  papiflixCouchbase?: Promise<{ bucket: Bucket; cluster: Cluster; scope: Scope }>;
};

const globalState = globalThis as CouchbaseState;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function getCouchbase() {
  if (!globalState.papiflixCouchbase) {
    globalState.papiflixCouchbase = (async () => {
      const { connect } = await import('couchbase');
      const connectionString = requiredEnvironment('COUCHBASE_CONNECTION_STRING');
      let cluster: Cluster;
      try {
        cluster = await connect(connectionString, {
          username: requiredEnvironment('COUCHBASE_USERNAME'),
          password: requiredEnvironment('COUCHBASE_PASSWORD'),
          configProfile: 'wanDevelopment',
        });
      } catch (error) {
        console.error('Couchbase bootstrap failed', {
          phase: 'connect',
          error: error instanceof Error ? error.name : 'UnknownError',
          validScheme: /^couchbases?:\/\//.test(connectionString),
          wrappedInQuotes: /^['"]|['"]$/.test(connectionString),
        });
        throw error;
      }
      try {
        const bucket = cluster.bucket(requiredEnvironment('COUCHBASE_BUCKET'));
        const scope = bucket.scope(process.env.COUCHBASE_SCOPE?.trim() || '_default');
        return { bucket, cluster, scope };
      } catch (error) {
        console.error('Couchbase bootstrap failed', { phase: 'bucket-or-scope', error: error instanceof Error ? error.name : 'UnknownError' });
        throw error;
      }
    })().catch((error: unknown) => {
      globalState.papiflixCouchbase = undefined;
      throw error;
    });
  }

  return globalState.papiflixCouchbase;
}

export function couchbaseDocumentKey(type: string, id: string): string {
  return `${type}::${encodeURIComponent(id)}`;
}

export const MEDIA_COLLECTIONS = ['papiflix', 'papianime', 'mangadex'] as const;
export type MediaCollection = typeof MEDIA_COLLECTIONS[number];

const IDENTITY_TYPES = new Set(['user', 'account', 'session', 'verificationToken']);

export function collectionForRecord(type: string, document: Record<string, unknown> = {}): string {
  if (IDENTITY_TYPES.has(type)) return 'identity';
  if (type === 'papiAnimeProgress') return 'papianime';
  const experience = document.experience;
  if (experience === 'papiflix' || experience === 'papianime') return experience;
  if (experience === 'papimanga' || experience === 'mangadex') return 'mangadex';
  const provider = document.mediaProvider;
  if (provider === 'tmdb') return 'papiflix';
  if (provider === 'anilist') return 'papianime';
  if (provider === 'mangadex') return 'mangadex';
  throw new Error(`Cannot determine Couchbase collection for ${type}.`);
}

export function collectionsForRecord(type: string, filters: Record<string, unknown> = {}): string[] {
  if (IDENTITY_TYPES.has(type)) return ['identity'];
  if (type === 'papiAnimeProgress') return ['papianime'];
  if (filters.experience || filters.mediaProvider) return [collectionForRecord(type, filters)];
  return [...MEDIA_COLLECTIONS];
}

export async function getDocument<T>(type: string, id: string): Promise<T | null> {
  const { scope } = await getCouchbase();
  for (const name of collectionsForRecord(type)) {
    try {
      const result = await scope.collection(name).get(couchbaseDocumentKey(type, id));
      return result.content as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'DocumentNotFoundError') continue;
      throw error;
    }
  }
  return null;
}

export async function upsertDocument<T extends Record<string, unknown>>(
  type: string,
  id: string,
  document: T,
): Promise<T & { id: string; type: string }> {
  const { scope } = await getCouchbase();
  const value = { ...document, id, type };
  await scope.collection(collectionForRecord(type, value)).upsert(couchbaseDocumentKey(type, id), value);
  return value;
}

export async function insertDocument<T extends Record<string, unknown>>(
  type: string,
  id: string,
  document: T,
): Promise<T & { id: string; type: string }> {
  const { scope } = await getCouchbase();
  const value = { ...document, id, type };
  await scope.collection(collectionForRecord(type, value)).insert(couchbaseDocumentKey(type, id), value);
  return value;
}

export async function removeDocument(type: string, id: string): Promise<void> {
  const { scope } = await getCouchbase();
  for (const name of collectionsForRecord(type)) {
    try {
      await scope.collection(name).remove(couchbaseDocumentKey(type, id));
      return;
    } catch (error) {
      if (error instanceof Error && error.name === 'DocumentNotFoundError') continue;
      throw error;
    }
  }
}
