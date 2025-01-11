// src/lib/hooks/useUsers.ts

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../socket/context';
import type { User } from '@/types';

// Create a shared state instance
let globalUsers: User[] = [];
let listeners: Set<(users: User[]) => void> = new Set();

const updateGlobalUsers = (users: User[]) => {
  globalUsers = users;
  listeners.forEach(listener => listener(users));
};

export function useUsers() {
  const [users, setUsers] = useState<User[]>(globalUsers);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();

  // Register listener for global updates
  useEffect(() => {
    const listener = (newUsers: User[]) => setUsers(newUsers);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Fetch users function
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('Fetching users from API...');
      const res = await fetch('/api/users');
      if (!res.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await res.json();
      console.log('Raw API response:', data);

      // Use status directly from backend, no defaults
      updateGlobalUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and socket status setup
  useEffect(() => {
    console.log('useUsers effect running, socket connected:', isConnected);
    fetchUsers();

    if (socket && isConnected) {
      console.log('Setting up socket status handler');
      const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
        console.log('Socket status change received:', { userId, newStatus });
        updateGlobalUsers(globalUsers.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        ));
      };

      socket.setStatusChangeHandler(handleStatusChange);
      return () => socket.setStatusChangeHandler(() => {});
    }
  }, [socket, isConnected, fetchUsers]);

  // Update user status function
  const updateUserStatus = useCallback((userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    console.log('updateUserStatus called:', { userId, newStatus });
    
    // Update global state immediately
    updateGlobalUsers(globalUsers.map(user =>
      user.id === userId ? { ...user, status: newStatus } : user
    ));

    // Update backend
    if (socket?.isConnected()) {
      console.log('Emitting status update to socket:', newStatus);
      socket.updateStatus(newStatus);
    } else {
      console.warn('Socket not connected, status update may fail');
    }
  }, [socket]);

  return {
    users,
    isLoading,
    error,
    updateUserStatus
  };
} 