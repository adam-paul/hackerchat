// src/lib/db/user.ts

import { prisma } from '@/lib/db/prisma';
import { auth, currentUser } from '@clerk/nextjs';

export async function getOrCreateUser() {
  const { userId } = auth();
  
  if (!userId) {
    throw new Error('No user ID found');
  }
  
  const user = await currentUser();
  
  if (!user) {
    throw new Error('No user data found');
  }

  const dbUser = await prisma.user.upsert({
    where: { id: userId },
    update: {
      name: user.username || (user.firstName ? `${user.firstName} ${user.lastName}` : undefined),
      imageUrl: user.imageUrl,
      email: user.emailAddresses[0]?.emailAddress,
    },
    create: {
      id: userId,
      name: user.username || (user.firstName ? `${user.firstName} ${user.lastName}` : undefined),
      imageUrl: user.imageUrl,
      email: user.emailAddresses[0]?.emailAddress || '',
    },
  });

  return dbUser;
}
