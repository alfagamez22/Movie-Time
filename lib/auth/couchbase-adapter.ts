import { createHash } from 'node:crypto';
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from 'next-auth/adapters';

import { deleteRecord, findRecord, readRecord, saveRecord, stableRecordId, type AppRecord } from '@/lib/db/records';

type UserDocument = AppRecord & Omit<AdapterUser, 'emailVerified'> & { emailVerified?: string | Date | null; passwordHash?: string | null };
type AccountDocument = AppRecord & AdapterAccount;
type SessionDocument = AppRecord & Omit<AdapterSession, 'expires'> & { expires: string | Date };
type VerificationDocument = AppRecord & { identifier: string; token: string; expires: string | Date };

function toAdapterUser(user: UserDocument): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
    image: user.image,
  };
}

function tokenKey(...values: string[]): string {
  return createHash('sha256').update(values.join('\0')).digest('hex');
}

export function CouchbaseAdapter(): Adapter {
  return {
    async createUser(user) {
      const now = new Date().toISOString();
      const saved = await saveRecord('user', user.id, {
        ...user,
        email: user.email.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      });
      return toAdapterUser(saved as UserDocument);
    },
    async getUser(id) {
      const user = await readRecord<UserDocument>('user', id);
      return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await findRecord<UserDocument>('user', { email: email.toLowerCase() });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await findRecord<AccountDocument>('account', { provider, providerAccountId });
      if (!account) return null;
      const user = await readRecord<UserDocument>('user', account.userId);
      return user ? toAdapterUser(user) : null;
    },
    async updateUser(user) {
      const existing = await readRecord<UserDocument>('user', user.id);
      if (!existing) throw new Error('Cannot update a user that does not exist.');
      const saved = await saveRecord('user', user.id, {
        ...existing,
        ...user,
        email: user.email?.toLowerCase() ?? existing.email,
        updatedAt: new Date().toISOString(),
      });
      return toAdapterUser(saved as UserDocument);
    },
    async deleteUser(id) {
      const user = await readRecord<UserDocument>('user', id);
      if (user) await deleteRecord('user', id);
      return user ? toAdapterUser(user) : null;
    },
    async linkAccount(account) {
      const id = stableRecordId(account.provider, account.providerAccountId);
      await saveRecord('account', id, account as unknown as Record<string, unknown>);
      return account;
    },
    async unlinkAccount({ provider, providerAccountId }) {
      const account = await findRecord<AccountDocument>('account', { provider, providerAccountId });
      if (account) await deleteRecord('account', account.id);
      return account ?? undefined;
    },
    async createSession(session) {
      const saved = await saveRecord('session', session.sessionToken, {
        ...session,
        expires: session.expires.toISOString(),
      });
      return { sessionToken: saved.sessionToken as string, userId: saved.userId as string, expires: new Date(saved.expires as string) };
    },
    async getSessionAndUser(sessionToken) {
      const session = await readRecord<SessionDocument>('session', sessionToken);
      if (!session) return null;
      const user = await readRecord<UserDocument>('user', session.userId);
      if (!user) return null;
      return {
        session: { sessionToken: session.sessionToken, userId: session.userId, expires: new Date(session.expires) },
        user: toAdapterUser(user),
      };
    },
    async updateSession(session) {
      const existing = await readRecord<SessionDocument>('session', session.sessionToken);
      if (!existing) return null;
      const saved = await saveRecord('session', session.sessionToken, {
        ...existing,
        ...session,
        expires: session.expires?.toISOString() ?? existing.expires,
      });
      return { sessionToken: saved.sessionToken, userId: saved.userId, expires: new Date(saved.expires) };
    },
    async deleteSession(sessionToken) {
      const session = await readRecord<SessionDocument>('session', sessionToken);
      if (session) await deleteRecord('session', sessionToken);
      return session ? { sessionToken: session.sessionToken, userId: session.userId, expires: new Date(session.expires) } : null;
    },
    async createVerificationToken(token) {
      const id = tokenKey(token.identifier, token.token);
      const saved = await saveRecord('verificationToken', id, {
        ...token,
        expires: token.expires.toISOString(),
      });
      return { identifier: saved.identifier as string, token: saved.token as string, expires: new Date(saved.expires as string) };
    },
    async useVerificationToken({ identifier, token }) {
      const id = tokenKey(identifier, token);
      const saved = await readRecord<VerificationDocument>('verificationToken', id);
      if (!saved) return null;
      await deleteRecord('verificationToken', id);
      return { identifier: saved.identifier, token: saved.token, expires: new Date(saved.expires) };
    },
    async getAccount(providerAccountId, provider) {
      return (await findRecord<AccountDocument>('account', { provider, providerAccountId })) ?? null;
    },
  };
}
