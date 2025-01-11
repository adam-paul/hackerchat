// src/lib/auth/context.tsx
'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { createContext, useContext } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userImageUrl: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: clerkLoaded, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  
  const value: AuthContextType = {
    isAuthenticated: !!isSignedIn,
    isLoading: !clerkLoaded,
    userId: userId ?? null,
    userEmail: user?.emailAddresses[0]?.emailAddress ?? null,
    userName: user?.username ?? null,
    userImageUrl: user?.imageUrl ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
