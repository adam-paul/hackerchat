// src/app/page.tsx

'use client';

import { useAuth } from '@clerk/nextjs';
import { AuthUI } from '@/components/ui/AuthUI';
import { HomeUI } from '@/components/ui/HomeUI';

export default function Page() {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return null; // Or a loading spinner
  }

  return userId ? (
    <HomeUI />
  ) : (
    <AuthUI />
  );
}
