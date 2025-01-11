import { createContext, useContext, useState, useCallback, useEffect } from 'react';
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

  // Initial fetch and socket setup
  useEffect(() => {
    // Initial fetch
    fetchUsers();

    if (socket && isConnected) {
      // Handle status updates from other clients
      const handleStatusChange = (event: { userId: string; status: 'online' | 'away' | 'busy' | 'offline' }) => {
        console.log('Socket status change received:', event);
        // Always update from server events
        setUsers(current => 
          current.map(user => 
            user.id === event.userId ? { ...user, status: event.status } : user
          )
        );
      };

      // Set up status change handler
      socket.setStatusChangeHandler(handleStatusChange);

      // Fetch users again on reconnect to ensure we have latest state
      const handleReconnect = () => {
        console.log('Socket reconnected, fetching latest user states');
        fetchUsers();
      };
      socket.on('connect', handleReconnect);

      // Cleanup handlers on unmount
      return () => {
        socket.setStatusChangeHandler(() => {});
        socket.off('connect', handleReconnect);
      };
    }
  }, [socket, isConnected, fetchUsers]);

  // Update user status
  const updateUserStatus = useCallback(async (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    if (!socket?.isConnected()) {
      console.error('Socket not connected');
      return;
    }

    try {
      console.log('updateUserStatus called with:', { userId, newStatus });
      
      // Update UI optimistically
      setUsers(current => {
        console.log('Current users before update:', current);
        const updated = current.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        );
        console.log('Users after update:', updated);
        return updated;
      });

      // Send update via socket
      console.log('Sending status update to socket:', { userId, newStatus });
      socket.updateStatus(newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
      // Revert to backend state on error
      fetchUsers();
    }
  }, [socket, fetchUsers]);

  return (
    <UsersContext.Provider value={{ users, isLoading, error, updateUserStatus }}>
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