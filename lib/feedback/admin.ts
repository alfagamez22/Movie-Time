import { getCouchbase, getDocument } from '@/lib/db/couchbase';

export interface RegisteredUser { id: string; name?: string; email?: string; image?: string; createdAt?: string }
export interface Feedback { id: string; userId: string; title: string; description: string; category: string; createdAt: string; user?: RegisteredUser }
function quote(value: string) { return `\`${value.replaceAll('`', '``')}\``; }
export async function adminList(kind: 'users' | 'feedback', page: number, search: string) {
  const { bucket, scope, cluster } = await getCouchbase();
  const root = `${quote(bucket.name)}.${quote(scope.name)}`;
  const collection = kind === 'users' ? 'identity' : 'feedback';
  const type = kind === 'users' ? 'user' : 'feedback';
  const filter = kind === 'users' ? '(CONTAINS(LOWER(IFMISSINGORNULL(d.name, "")), $search) OR CONTAINS(LOWER(IFMISSINGORNULL(d.email, "")), $search))' : '(CONTAINS(LOWER(d.title), $search) OR CONTAINS(LOWER(d.category), $search))';
  const where = 'd.type = $type' + (search ? ` AND ${filter}` : '');
  const parameters = { type, search: search.toLowerCase(), offset: (page - 1) * 50 };
  const [count, rows] = await Promise.all([
    cluster.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${root}.${quote(collection)} d WHERE ${where}`, { parameters }),
    cluster.query<RegisteredUser | Feedback>(kind === 'users'
      ? `SELECT d.id, d.name, d.email, d.image, d.createdAt FROM ${root}.\`identity\` d WHERE ${where} ORDER BY LOWER(IFMISSINGORNULL(d.name, d.email, "")), d.id LIMIT 50 OFFSET $offset`
      : `SELECT d.* FROM ${root}.\`feedback\` d WHERE ${where} ORDER BY d.createdAt DESC, d.id LIMIT 50 OFFSET $offset`, { parameters }),
  ]);
  const hydrated = kind === 'feedback' ? await Promise.all(rows.rows.map(async (row) => {
    const feedback = row as Feedback;
    const user = await getDocument<RegisteredUser>('user', feedback.userId);
    return { ...feedback, user: user ? { id: user.id, name: user.name, email: user.email, image: user.image } : undefined };
  })) : rows.rows;
  return { total: count.rows[0]?.total ?? 0, rows: hydrated };
}
