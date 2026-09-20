import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let prismaInstance = globalForPrisma.prisma;

function makePrisma(): PrismaClient {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('DATABASE_URL is not configured.');
  }

  // pg-connection-string v2.13.0 emits a one-time SECURITY WARNING on startup
  // when sslmode is set to 'prefer', 'require', or 'verify-ca'.
  // Normalise to 'verify-full' only when the client is actually needed.
  const url = new URL(raw);
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.delete('uselibpqcompat');

  const adapter = new PrismaPg({ connectionString: url.toString() });
  return new PrismaClient({ adapter });
}

function getPrisma(): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }

  prismaInstance = makePrisma();

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prismaInstance;
  }

  return prismaInstance;
}

// Avoid connecting to or even parsing DATABASE_URL during Next.js module discovery.
// The real Prisma client is created on first database operation at request time.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
