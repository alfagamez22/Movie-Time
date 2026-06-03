import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

function makePrisma() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL environment variable is not set.');

  // pg-connection-string v2.13.0 emits a one-time SECURITY WARNING on startup
  // when sslmode is set to 'prefer', 'require', or 'verify-ca'.
  // Normalise to 'verify-full' — this is a no-op if already set and
  // does NOT trigger the warning. Zero runtime overhead (string ops only).
  const url = new URL(raw);
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.delete('uselibpqcompat');

  // Fallback if Prisma's pooled endpoint rejects verify-full:
  //   url.searchParams.set('sslmode', 'require');
  //   url.searchParams.set('uselibpqcompat', 'true');

  const adapter = new PrismaPg({ connectionString: url.toString() });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  return (globalForPrisma.prisma ??= makePrisma());
}

// Use a Proxy so that `makePrisma()` (and therefore `new URL(DATABASE_URL)`) is
// only called the first time a Prisma method is actually invoked at request
// time — never during Next.js build-time module evaluation, when DATABASE_URL
// is not available.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
  set(_target, prop, value) {
    return Reflect.set(getClient(), prop, value);
  },
  has(_target, prop) {
    return Reflect.has(getClient(), prop);
  },
});
