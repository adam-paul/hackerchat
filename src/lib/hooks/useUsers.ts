// src/lib/hooks/useUsers.ts

import { useState, useEffect } from 'react';
import { useSocket } from '../socket/context';
import type { User } from '@/types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();

  // Fetch users when component mounts or when socket connection changes
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/users');
        if (!res.ok) {
          throw new Error('Failed to fetch users');
        }
        const data = await res.json();
        
        // Use status directly from database - no manual overrides
        setUsers(data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch users');
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchUsers();

    // Set up periodic rehydration
    const rehydrationInterval = setInterval(fetchUsers, 30000); // Rehydrate every 30 seconds

    return () => {
      clearInterval(rehydrationInterval);
    };
  }, [socket, isConnected]);

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
    error
  };
} 