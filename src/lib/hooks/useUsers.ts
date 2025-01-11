// src/lib/hooks/useUsers.ts

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../socket/context';
import type { User } from '@/types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();

  // Fetch users function
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/users');
      if (!res.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle real-time status updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
      setUsers(prev => prev.map(user =>
        user.id === userId ? { ...user, status: newStatus } : user
      ));
    };

    socket.setStatusChangeHandler(handleStatusChange);

    return () => {
      socket.setStatusChangeHandler(() => {});
    };
  }, [socket, isConnected]);

  return {
    users,
    isLoading,
    error,
    refetch: fetchUsers
  };
} 