// src/lib/socket/context.tsx
'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SocketService } from './service';
import { setupSocketIntegration } from '../store/socket-integration';
import type { Message } from '@/types';

export type SocketContextType = {
  isConnected: boolean;
  error: string | null;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  sendMessage: (messageId: string, channelId: string, content: string, fileData?: {
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }, replyToId?: string) => void;
  updateStatus: (status: 'online' | 'away' | 'busy' | 'offline') => void;
  createChannel: (data: {
    name: string;
    description?: string;
    parentId?: string;
    initialMessage?: {
      content: string;
      authorId: string;
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      originalId?: string;
    };
    messageId?: string;
    originalId?: string;
  }) => void;
  getSocketService: () => SocketService | null;
};

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  error: null,
  joinChannel: () => {},
  leaveChannel: () => {},
  sendMessage: () => {},
  updateStatus: () => {},
  createChannel: () => {},
  getSocketService: () => null
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const tokenGetterRef = useRef(getToken);
  const [socketService, setSocketService] = useState<SocketService | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageHandlerRef = useRef<((message: Message) => void) | undefined>();
  const serviceRef = useRef<SocketService | null>(null);

  // Update the ref when getToken changes
  useEffect(() => {
    tokenGetterRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    // Only attempt connection if auth is loaded
    if (!isLoaded) return;

    // Only create the service once
    if (!serviceRef.current) {
      const service = new SocketService();
      serviceRef.current = service;
      setSocketService(service);
    }

    const connect = async () => {
      if (!serviceRef.current) return;
      
      try {
        const token = await tokenGetterRef.current();
        if (!token) throw new Error('No authentication token available');
        
        await serviceRef.current.connect(token);
        setIsConnected(true);
        setError(null);

        // Set up store integration
        const cleanup = setupSocketIntegration(serviceRef.current);
        return cleanup;
      } catch (error) {
        console.error('Socket connection error:', error);
        setError(error instanceof Error ? error.message : 'Failed to connect to socket server');
        setIsConnected(false);
      }
    };

    const cleanup = connect();

    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
      }
      // Clean up store integration
      cleanup?.then(cleanupFn => cleanupFn?.());
    };
  }, [isLoaded]);

  const handleError = (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    setError(errorMessage);
  };

  const joinChannel = (channelId: string) => {
    try {
      socketService?.joinChannel(channelId);
    } catch (error) {
      console.error('Failed to join channel:', error);
      handleError(error);
    }
  };

  const leaveChannel = (channelId: string) => {
    try {
      socketService?.leaveChannel(channelId);
    } catch (error) {
      console.error('Failed to leave channel:', error);
      handleError(error);
    }
  };

  const sendMessage = (messageId: string, channelId: string, content: string, fileData?: {
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }, replyToId?: string) => {
    try {
      socketService?.sendMessage(messageId, channelId, content, fileData, replyToId);
    } catch (error) {
      console.error('Failed to send message:', error);
      handleError(error);
    }
  };

  const updateStatus = (status: 'online' | 'away' | 'busy' | 'offline') => {
    try {
      socketService?.updateStatus(status);
    } catch (error) {
      console.error('Failed to update status:', error);
      handleError(error);
    }
  };

  useEffect(() => {
    const initSocket = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setError('No auth token available');
          return;
        }

        const service = new SocketService();
        await service.connect(token);
        
        setSocketService(service);
        serviceRef.current = service;
        setIsConnected(true);
        setError(null);
      } catch (error) {
        console.error('Socket initialization error:', error);
        setError(error instanceof Error ? error.message : 'Failed to initialize socket');
      }
    };

    initSocket();
  }, []);

  const value: SocketContextType = {
    isConnected,
    error,
    joinChannel,
    leaveChannel,
    sendMessage,
    updateStatus,
    createChannel: (data) => {
      try {
        socketService?.createChannel(data);
      } catch (error) {
        console.error('Failed to create channel:', error);
        setError(error instanceof Error ? error.message : 'Failed to create channel');
      }
    },
    getSocketService: () => socketService
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
} 