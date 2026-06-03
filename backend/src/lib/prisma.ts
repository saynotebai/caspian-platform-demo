import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient. In dev (with tsx watch / HMR) we attach the instance
// to globalThis so reloads reuse the same client instead of exhausting the
// database connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
