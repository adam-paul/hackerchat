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
      console.log('Fetched users from backend:', data); // Debug log
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and socket status setup
  useEffect(() => {
    fetchUsers();

    // Set up socket status handler
    if (socket && isConnected) {
      const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
        console.log('Received status change:', { userId, newStatus }); // Debug log
        setUsers(prev => prev.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        ));
      };

      socket.setStatusChangeHandler(handleStatusChange);

      return () => {
        socket.setStatusChangeHandler(() => {});
      };
    }
  }, [socket, isConnected, fetchUsers]);

  // Update user status function
  const updateUserStatus = useCallback((userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    console.log('Updating user status:', { userId, newStatus }); // Debug log

    // Update UI immediately
    setUsers(prev => prev.map(user =>
      user.id === userId ? { ...user, status: newStatus } : user
    ));

    // Update backend
    if (socket?.isConnected()) {
      socket.updateStatus(newStatus);
    }
  }, [socket]);

  return {
    users,
    isLoading,
    error,
    updateUserStatus
  };
} 