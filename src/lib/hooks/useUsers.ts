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
        // Ensure all users start as offline
        setUsers(data.map((user: User) => ({ ...user, status: 'offline' })));
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
        status: connectedUserIds.includes(user.id) ? 'online' : 'offline'
      })));
    };

    // Handle user connected
    const handleUserConnected = (userId: string) => {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, status: 'online' } : user
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
      console.log('Status change received:', userId, newStatus); // Debug log
      setUsers(prev => {
        const newUsers = prev.map(user =>
          user.id === userId ? { ...user, status: newStatus } : user
        );
        console.log('Updated users:', newUsers); // Debug log
        return newUsers;
      });
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

  return {
    users,
    isLoading,
    error
  };
} 