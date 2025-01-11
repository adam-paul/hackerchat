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
      console.log('Fetched users from backend:', data);
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and periodic refresh
  useEffect(() => {
    console.log('Initializing users from backend');
    fetchUsers();
    const refreshInterval = setInterval(fetchUsers, 60000);
    return () => clearInterval(refreshInterval);
  }, [fetchUsers]);

  // Handle real-time status updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleStatusChange = useCallback((userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
      console.log('Handling status change:', { userId, newStatus });
      setUsers(prev => {
        // Ensure we're not returning the same array if nothing changed
        const userToUpdate = prev.find(u => u.id === userId);
        if (!userToUpdate || userToUpdate.status === newStatus) {
          return prev;
        }
        const updated = prev.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        );
        console.log('Updated users after status change:', updated);
        return updated;
      });
    }, []);

    socket.setStatusChangeHandler(handleStatusChange);

    // Fetch initial state when socket connects
    if (isConnected) {
      fetchUsers();
    }

    return () => {
      socket.setStatusChangeHandler(() => {});
    };
  }, [socket, isConnected, fetchUsers]);

  return {
    users,
    isLoading,
    error,
    refetch: fetchUsers
  };
} 