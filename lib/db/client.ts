import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

function makePrisma() {
  const raw = process.env.DATABASE_URL!;

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

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
