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

  // Fetch users from backend
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('Fetching initial users...');
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      console.log('Initial users loaded:', data);
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle status updates from other clients
  const handleStatusChange = useCallback((event: { userId: string; status: 'online' | 'away' | 'busy' | 'offline' }) => {
    console.log('Socket status change received:', event);
    setUsers(current => {
      const updated = current.map(user => 
        user.id === event.userId ? { ...user, status: event.status } : user
      );
      return JSON.stringify(updated) !== JSON.stringify(current) ? updated : current;
    });
  }, []);

  // Update user status
  const updateUserStatus = useCallback(async (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    if (!socket?.isConnected()) {
      console.error('Socket not connected');
      return;
    }

    try {
      setUsers(current => {
        const updated = current.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        );
        return JSON.stringify(updated) !== JSON.stringify(current) ? updated : current;
      });

      socket.updateStatus(newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
      setError(error instanceof Error ? error.message : 'Failed to update status');
    }
  }, [socket]);

  // Initial fetch and socket setup
  useEffect(() => {
    fetchUsers();

    if (socket && isConnected) {
      socket.setStatusChangeHandler(handleStatusChange);

      const handleReconnect = () => {
        console.log('Socket reconnected, fetching latest user states');
        fetchUsers();
      };
      socket.on('connect', handleReconnect);

      return () => {
        socket.setStatusChangeHandler(() => {});
        socket.off('connect', handleReconnect);
      };
    }
  }, [socket, isConnected, fetchUsers, handleStatusChange]);

  const value = useMemo(() => ({
    users,
    isLoading,
    error,
    updateUserStatus
  }), [users, isLoading, error, updateUserStatus]);

  return (
    <UsersContext.Provider value={value}>
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