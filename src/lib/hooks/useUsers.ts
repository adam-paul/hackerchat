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
    fetchUsers();

    if (socket && isConnected) {
      const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
        console.log('Socket status change received:', { userId, newStatus });
        setUsers(current => {
          const updated = current.map(user =>
            user.id === userId ? { ...user, status: newStatus } : user
          );
          console.log('Users after socket update:', updated);
          return updated;
        });
      };

      socket.setStatusChangeHandler(handleStatusChange);
      return () => socket.setStatusChangeHandler(() => {});
    }
  }, [socket, isConnected, fetchUsers]);

  // Update user status
  const updateUserStatus = useCallback(async (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    if (!socket?.isConnected()) {
      console.error('Socket not connected');
      return;
    }

    console.log('Updating status locally:', { userId, newStatus });
    // Update UI immediately
    setUsers(current => {
      const updated = current.map(user =>
        user.id === userId ? { ...user, status: newStatus } : user
      );
      console.log('Users after local update:', updated);
      return updated;
    });

    // Send update via socket - this will update the database and notify other clients
    console.log('Sending status update to socket:', newStatus);
    socket.updateStatus(newStatus);
  }, [socket]);

  return {
    users,
    isLoading,
    error,
    updateUserStatus
  };
} 