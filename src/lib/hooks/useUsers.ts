// src/lib/hooks/useUsers.ts

import { useState, useEffect } from 'react';
import { useSocket } from '../socket/context';

interface User {
  id: string;
  name: string;
  imageUrl?: string | null;
  isOnline: boolean;
}

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
        // Keep users offline initially until we get the connected users list
        setUsers(data.map((user: any) => ({ ...user, isOnline: false })));
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
        isOnline: connectedUserIds.includes(user.id)
      })));
    };

    // Handle user connected
    const handleUserConnected = (userId: string) => {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, isOnline: true } : user
      ));
    };

    // Handle user disconnected
    const handleUserDisconnected = (userId: string) => {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, isOnline: false } : user
      ));
    };

    socket.on('connected-users', handleConnectedUsers);
    socket.on('user-connected', handleUserConnected);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('connected-users', handleConnectedUsers);
      socket.off('user-connected', handleUserConnected);
      socket.off('user-disconnected', handleUserDisconnected);
    };
  }, [socket, isConnected]);

  return {
    users,
    isLoading,
    error
  };
} 