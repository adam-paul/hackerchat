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
      console.log('Fetched users from API:', data);
      
      // Update users while preserving any pending status changes
      setUsers(prev => {
        const updated = data.map((newUser: User) => {
          const existingUser = prev.find(u => u.id === newUser.id);
          // If user exists and has a different status, keep the existing status
          if (existingUser && existingUser.status !== newUser.status) {
            console.log('Preserving status for user:', {
              userId: newUser.id,
              existingStatus: existingUser.status,
              newStatus: newUser.status
            });
            return { ...newUser, status: existingUser.status };
          }
          return newUser;
        });
        return updated;
      });
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

    // Set up periodic rehydration with longer interval
    const rehydrationInterval = setInterval(fetchUsers, 60000); // Changed to 60 seconds

    return () => {
      clearInterval(rehydrationInterval);
    };
  }, [fetchUsers]);

  // Handle real-time status updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
      console.log('Status change received:', { userId, newStatus });
      setUsers(prev => {
        const updated = prev.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        );
        return updated;
      });
    };

    // Set up status change handler
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