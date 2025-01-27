// socket-server/src/lib/db.ts

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty',
}); 