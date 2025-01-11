// src/lib/hooks/useUsers.ts

import { useState, useEffect } from 'react';
import { useSocket } from '../socket/context';
import type { User } from '@/types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();

  // Fetch users when component mounts
  useEffect(() => {
    const fetchUsers = async () => {
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
    };

    fetchUsers();
  }, []);

  // Set up socket event listeners only when socket is connected
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handle initial connected users
    const handleConnectedUsers = (connectedUserIds: string[]) => {
      setUsers(prev => prev.map(user => ({
        ...user,
        status: connectedUserIds.includes(user.id) ? user.status || 'online' : 'offline'
      })));
    };

    // Handle user connected
    const handleUserConnected = (userId: string) => {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, status: user.status || 'online' } : user
      ));
    };

    // Handle user disconnected
    const handleUserDisconnected = (userId: string) => {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, status: 'offline' } : user
      ));
    };

    // Handle status changes
    const handleStatusChange = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
      setUsers(prev => prev.map(user =>
        user.id === userId ? { ...user, status: newStatus } : user
      ));
    };

    // Set up event listeners
    socket.on('connected-users', handleConnectedUsers);
    socket.on('user-connected', handleUserConnected);
    socket.on('user-disconnected', handleUserDisconnected);
    socket.setStatusChangeHandler(handleStatusChange);

    // Clean up event listeners
    return () => {
      socket.off('connected-users', handleConnectedUsers);
      socket.off('user-connected', handleUserConnected);
      socket.off('user-disconnected', handleUserDisconnected);
      socket.setStatusChangeHandler(() => {});
    };
  }, [socket, isConnected]);

  // Add optimistic updates for status changes
  const updateUserStatus = (userId: string, newStatus: 'online' | 'away' | 'busy' | 'offline') => {
    setUsers(prev => prev.map(user =>
      user.id === userId ? { ...user, status: newStatus } : user
    ));
  };

  return {
    users,
    isLoading,
    error,
    updateUserStatus // Export the optimistic update function
  };
} 