// src/lib/socket/context.tsx
'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SocketService } from './service';
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
  }) => void;
  updateStatus: (status: 'online' | 'away' | 'busy' | 'offline') => void;
  onMessage?: (message: Message) => void;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  error: undefined,
  socket: null,
  joinChannel: () => {},
  leaveChannel: () => {},
  sendMessage: () => {},
  updateStatus: () => {}
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const tokenGetterRef = useRef(getToken);
  const [socketService, setSocketService] = useState<SocketService | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string>();
  const messageHandlerRef = useRef<((message: Message) => void) | undefined>();
  const serviceRef = useRef<SocketService | null>(null);

  // Update the ref when getToken changes
  useEffect(() => {
    tokenGetterRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
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
      } catch (error) {
        console.error('Socket connection error:', error);
        setError(error instanceof Error ? error.message : 'Failed to connect to socket server');
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
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
  }) => {
    try {
      socketService?.sendMessage(messageId, channelId, content, fileData);
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

  return (
    <SocketContext.Provider value={{
      isConnected,
      error,
      socket: socketService,
      joinChannel,
      leaveChannel,
      sendMessage,
      updateStatus,
      onMessage: messageHandlerRef.current
    }}>
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