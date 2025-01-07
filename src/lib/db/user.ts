import { prisma } from '@/lib/db/prisma';
import { auth } from '@clerk/nextjs';

export async function getOrCreateUser() {
  const { userId, user } = auth();
  
  if (!userId || !user) {
    throw new Error('Unauthorized');
  }

  const dbUser = await prisma.user.upsert({
    where: { id: userId },
    update: {
      name: user.firstName ? `${user.firstName} ${user.lastName}` : undefined,
      imageUrl: user.imageUrl,
      email: user.emailAddresses[0]?.emailAddress,
    },
    create: {
      id: userId,
      name: user.firstName ? `${user.firstName} ${user.lastName}` : undefined,
      imageUrl: user.imageUrl,
      email: user.emailAddresses[0]?.emailAddress || '',
    },
  });

  return dbUser;
}

