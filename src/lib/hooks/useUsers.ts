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
      console.log('Fetched users from API:', data); // Debug log
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and rehydration
  useEffect(() => {
    fetchUsers();

    // Set up periodic rehydration
    const rehydrationInterval = setInterval(fetchUsers, 30000);

    return () => {
      clearInterval(rehydrationInterval);
    };
  }, [fetchUsers]);

  // Handle real-time status updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
      console.log('Status change received:', { userId, newStatus }); // Debug log
      setUsers(prev => {
        const updated = prev.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        );
        console.log('Updated users after status change:', updated); // Debug log
        return updated;
      });
    };

    // Set up status change handler
    socket.setStatusChangeHandler(handleStatusChange);

    // Fetch users when connection is established
    if (isConnected) {
      console.log('Socket connected, fetching users...'); // Debug log
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