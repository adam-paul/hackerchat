import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useSocket } from '../socket/context';
import type { User } from '@/types';

interface UsersContextType {
  users: User[];
  isLoading: boolean;
  error: string | null;
  updateUserStatus: (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => void;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();

  // Memoize the context value
  const contextValue = useMemo(() => ({
    users,
    isLoading,
    error,
    updateUserStatus: async (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
      try {
        const res = await fetch(`/api/users/${userId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Failed to update status');
        
        setUsers(current => 
          current.map(user => 
            user.id === userId ? { ...user, status: newStatus } : user
          )
        );
      } catch (error) {
        console.error('Failed to update status:', error);
      }
    }
  }), [users, isLoading, error]);

  return (
    <UsersContext.Provider value={contextValue}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (context === undefined) {
    throw new Error('useUsers must be used within a UsersProvider');
  }
  return context;
} 