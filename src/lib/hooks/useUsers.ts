// src/lib/hooks/useUsers.ts

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../socket/context';
import type { User } from '@/types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();

  // Fetch users from backend
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
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
    fetchUsers();

    if (socket && isConnected) {
      const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
        setUsers(current => current.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        ));
      };

      socket.setStatusChangeHandler(handleStatusChange);
      return () => socket.setStatusChangeHandler(() => {});
    }
  }, [socket, isConnected, fetchUsers]);

  // Update user status
  const updateUserStatus = useCallback(async (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    if (socket?.isConnected()) {
      socket.updateStatus(newStatus);
      // Let the socket event handler update the UI
    }
  }, [socket]);

  return {
    users,
    isLoading,
    error,
    updateUserStatus
  };
} 