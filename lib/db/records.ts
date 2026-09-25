import { collectionsForRecord, getCouchbase, getDocument, removeDocument, upsertDocument } from './couchbase';

export type AppRecord = Record<string, unknown> & {
  id: string;
  type?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type Scalar = string | number | boolean | null;
type RecordFilters = Record<string, Scalar>;

const FILTER_FIELDS = new Set([
  'userId', 'experience', 'mediaId', 'mediaType', 'mediaProvider', 'season', 'episode',
  'anilistId', 'email', 'provider', 'providerAccountId', 'sessionToken', 'expires',
  'createdAt', 'updatedAt', 'watchedAt',
]);
const SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'watchedAt', 'lastWatchedAt']);

function quoteIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

export async function findRecords<T extends AppRecord>(
  type: string,
  filters: RecordFilters,
  options: { orderBy?: keyof T & string; direction?: 'asc' | 'desc'; limit?: number } = {},
): Promise<T[]> {
  const { bucket, cluster, scope } = await getCouchbase();
  const where = ['d.type = $type'];
  const parameters: Record<string, Scalar | number> = { type };

  for (const [field, value] of Object.entries(filters)) {
    if (!FILTER_FIELDS.has(field)) throw new Error(`Unsupported Couchbase filter field: ${field}`);
    const parameter = `filter${Object.keys(parameters).length}`;
    parameters[parameter] = value;
    where.push(`d.${quoteIdentifier(field)} = $${parameter}`);
  }

  let order = '';
  if (options.orderBy) {
    if (!SORT_FIELDS.has(options.orderBy)) throw new Error(`Unsupported Couchbase sort field: ${options.orderBy}`);
    order = ` ORDER BY d.${quoteIdentifier(options.orderBy)} ${options.direction === 'asc' ? 'ASC' : 'DESC'}`;
  }

  const limit = options.limit == null ? '' : ' LIMIT $limit';
  if (options.limit != null) parameters.limit = Math.max(0, Math.floor(options.limit));

  const collections = collectionsForRecord(type, filters);
  const results = await Promise.all(collections.map(async (name) => {
    const query = `SELECT d.* FROM ${quoteIdentifier(bucket.name)}.${quoteIdentifier(scope.name)}.${quoteIdentifier(name)} AS d WHERE ${where.join(' AND ')}${order}${limit}`;
    const result = await cluster.query<T>(query, {
      parameters,
      scanConsistency: 'request_plus' as import('couchbase').QueryScanConsistency,
    });
    return result.rows;
  }));
  const rows = results.flat();
  if (options.orderBy) {
    const field = options.orderBy;
    const direction = options.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => direction * String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
  }
  return options.limit == null ? rows : rows.slice(0, Math.max(0, Math.floor(options.limit)));
}

export async function findRecord<T extends AppRecord>(type: string, filters: RecordFilters): Promise<T | null> {
  return (await findRecords<T>(type, filters, { limit: 1 }))[0] ?? null;
}

export async function readRecord<T extends AppRecord>(type: string, id: string): Promise<T | null> {
  return getDocument<T>(type, id);
}

export async function saveRecord<T extends Record<string, unknown>>(
  type: string,
  id: string,
  data: T,
): Promise<T & { id: string; type: string }> {
  return upsertDocument(type, id, data);
}

export async function deleteRecord(type: string, id: string): Promise<void> {
  return removeDocument(type, id);
}

export function stableRecordId(...parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => encodeURIComponent(part == null ? '' : String(part))).join(':');
}

export function asDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
