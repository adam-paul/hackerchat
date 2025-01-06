'use client';

import { useAuthContext } from './context';
import { redirect } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return fallback ?? <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    redirect('/');
  }

  return <>{children}</>;
}

