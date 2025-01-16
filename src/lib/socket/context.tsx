// src/lib/socket/context.tsx
'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SocketService } from './service';
import { setupSocketIntegration } from '../store/socket-integration';
import type { Message } from '@/types';

interface SocketContextType {
  isConnected: boolean;
  error?: string;
  socket: SocketService | null;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  sendMessage: (messageId: string, channelId: string, content: string, fileData?: {
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }, replyToId?: string) => void;
  updateStatus: (status: 'online' | 'away' | 'busy' | 'offline') => void;
  onMessage: (handler: (message: Message) => void) => void;
  onMessageUpdate: (handler: (message: Message) => void) => void;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  error: undefined,
  socket: null,
  joinChannel: () => {},
  leaveChannel: () => {},
  sendMessage: () => {},
  updateStatus: () => {},
  onMessage: () => {},
  onMessageUpdate: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const tokenGetterRef = useRef(getToken);
  const [socketService, setSocketService] = useState<SocketService | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string>();
  const messageHandlerRef = useRef<((message: Message) => void) | undefined>();
  const messageUpdateHandlerRef = useRef<((message: Message) => void) | undefined>();
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
        setError(undefined);

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

  useEffect(() => {
    if (!serviceRef.current) return;

    // Set up message handlers
    serviceRef.current.setMessageHandler((message) => {
      messageHandlerRef.current?.(message);
    });

    serviceRef.current.setMessageUpdateHandler((message) => {
      messageUpdateHandlerRef.current?.(message);
    });

    return () => {
      if (serviceRef.current) {
        serviceRef.current.setMessageHandler(() => {});
        serviceRef.current.setMessageUpdateHandler(() => {});
      }
    };
  }, []);

  const joinChannel = (channelId: string) => {
    try {
      socketService?.joinChannel(channelId);
    } catch (error) {
      console.error('Failed to join channel:', error);
      setError(error instanceof Error ? error.message : 'Failed to join channel');
    }
  };

  const leaveChannel = (channelId: string) => {
    try {
      socketService?.leaveChannel(channelId);
    } catch (error) {
      console.error('Failed to leave channel:', error);
      setError(error instanceof Error ? error.message : 'Failed to leave channel');
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
      setError(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  const updateStatus = (status: 'online' | 'away' | 'busy' | 'offline') => {
    try {
      socketService?.updateStatus(status);
    } catch (error) {
      console.error('Failed to update status:', error);
      setError(error instanceof Error ? error.message : 'Failed to update status');
    }
  };

  const value = {
    isConnected,
    error,
    socket: socketService,
    joinChannel,
    leaveChannel,
    sendMessage,
    updateStatus,
    onMessage: (handler: (message: Message) => void) => {
      messageHandlerRef.current = handler;
    },
    onMessageUpdate: (handler: (message: Message) => void) => {
      messageUpdateHandlerRef.current = handler;
    },
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