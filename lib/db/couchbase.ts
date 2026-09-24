import type { Bucket, Cluster, Collection, Scope } from 'couchbase';

type CouchbaseState = typeof globalThis & {
  papiflixCouchbase?: Promise<{ bucket: Bucket; cluster: Cluster; collection: Collection; scope: Scope }>;
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
      return connect(requiredEnvironment('COUCHBASE_CONNECTION_STRING'), {
        username: requiredEnvironment('COUCHBASE_USERNAME'),
        password: requiredEnvironment('COUCHBASE_PASSWORD'),
        configProfile: 'wanDevelopment',
      }).then((cluster) => {
        const bucket = cluster.bucket(requiredEnvironment('COUCHBASE_BUCKET'));
        const scope = bucket.scope(process.env.COUCHBASE_SCOPE?.trim() || '_default');
        return { bucket, cluster, collection: scope.collection('_default'), scope };
      });
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

export async function getDocument<T>(type: string, id: string): Promise<T | null> {
  const { collection } = await getCouchbase();
  try {
    const result = await collection.get(couchbaseDocumentKey(type, id));
    return result.content as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'DocumentNotFoundError') return null;
    throw error;
  }
}

export async function upsertDocument<T extends Record<string, unknown>>(
  type: string,
  id: string,
  document: T,
): Promise<T & { id: string; type: string }> {
  const { collection } = await getCouchbase();
  const value = { ...document, id, type };
  await collection.upsert(couchbaseDocumentKey(type, id), value);
  return value;
}

export async function insertDocument<T extends Record<string, unknown>>(
  type: string,
  id: string,
  document: T,
): Promise<T & { id: string; type: string }> {
  const { collection } = await getCouchbase();
  const value = { ...document, id, type };
  await collection.insert(couchbaseDocumentKey(type, id), value);
  return value;
}

export async function removeDocument(type: string, id: string): Promise<void> {
  const { collection } = await getCouchbase();
  try {
    await collection.remove(couchbaseDocumentKey(type, id));
  } catch (error) {
    if (error instanceof Error && error.name === 'DocumentNotFoundError') return;
    throw error;
  }
}
