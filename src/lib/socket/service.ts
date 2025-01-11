// src/lib/socket/service.ts

import { io, Socket } from 'socket.io-client';
import type { Message, Reaction } from '@/types';

interface MessageCallbacks {
  onDelivered?: (messageId: string) => void;
  onError?: (messageId: string, error: string) => void;
  onMessage?: (message: Message) => void;
}

export class SocketService {
  private socket: Socket | null = null;
  private messageCallbacks: Map<string, MessageCallbacks> = new Map();
  private reconnectAttempts = 0;
  private token: string | null = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 1000;
  private onMessageHandler?: (message: Message) => void;
  private onMessageDeleteHandler?: (event: { messageId: string; originalId?: string }) => void;
  private onStatusChangeHandler?: (userId: string, status: 'online' | 'away' | 'busy' | 'offline') => void;
  private onReactionAddedHandler?: (event: { messageId: string; reaction: Reaction }) => void;
  private onReactionRemovedHandler?: (event: { messageId: string; reaction: Reaction }) => void;

  constructor(private readonly url: string = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000') {}

  // Add event listener
  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.socket) return;
    this.socket.on(event, callback);
  }

  // Remove event listener
  off(event: string, callback: (...args: any[]) => void): void {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }

  async connect(token: string): Promise<void> {
    if (this.socket?.connected) return;

    try {
      this.token = token;
      
      // Parse the JWT token to get the user ID
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        const userId = payload.sub;
        
        this.socket = io(this.url, {
          auth: { token, userId },
          reconnection: true,
          reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: this.RECONNECT_DELAY,
          timeout: 5000,
          transports: ['websocket'],
          query: { 
            // Pass initial connection flag to server
            initialConnection: 'true'
          }
        });

        this.setupEventHandlers();
        await this.waitForConnection();
      } else {
        throw new Error('Invalid token format');
      }
    } catch (error) {
      console.error('Socket connection error:', error);
      throw new Error('Failed to connect to socket server');
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.handleReconnect();
    });

    this.socket.on('message', (event) => {
      // Only process messages from other users
      const userId = (this.socket?.auth as { token: string })?.token;
      const messageAuthorId = event.message.author.id;
      
      // Skip if this is our own message
      if (messageAuthorId === userId || messageAuthorId === 'optimistic') {
        return;
      }
      
      this.onMessageHandler?.(event.message);
    });

    this.socket.on('message-delivered', (event) => {
      const callbacks = this.messageCallbacks.get(event.originalId || event.messageId);
      if (callbacks) {
        callbacks.onDelivered?.(event.messageId);
        // If there's a message handler, update the message with the new ID
        if (this.onMessageHandler && event.message) {
          this.onMessageHandler(event.message);
        }
        this.messageCallbacks.delete(event.originalId || event.messageId);
      }
    });

    this.socket.on('message-error', ({ messageId, error }) => {
      const callbacks = this.messageCallbacks.get(messageId);
      callbacks?.onError?.(messageId, error);
      this.messageCallbacks.delete(messageId);
    });

    // Handle message deletion events from the server
    this.socket.on('message-deleted', (event) => {
      if (this.onMessageDeleteHandler) {
        this.onMessageDeleteHandler(event);
      }
    });

    // Handle status change events from the server
    this.socket.on('status-changed', (event) => {
      console.log('Received status change from server:', event);
      const { userId, status } = event;
      if (this.onStatusChangeHandler) {
        this.onStatusChangeHandler(userId, status);
      }
    });

    // Handle reaction events
    this.socket.on('reaction-added', (event) => {
      if (this.onReactionAddedHandler) {
        // Skip if this is our own reaction (we already handled it optimistically)
        const userId = (this.socket?.auth as { token: string })?.token;
        if (event.reaction?.user?.id === userId) {
          return;
        }
        this.onReactionAddedHandler(event);
      }
    });

    this.socket.on('reaction-removed', (event) => {
      if (this.onReactionRemovedHandler) {
        // Skip if this is our own reaction (we already handled it optimistically)
        const userId = (this.socket?.auth as { token: string })?.token;
        if (event.reaction?.user?.id === userId) {
          return;
        }
        this.onReactionRemovedHandler(event);
      }
    });
  }

  private async handleReconnect(): Promise<void> {
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= this.MAX_RECONNECT_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY));
      if (this.token && this.socket) {
        this.socket.auth = { token: this.token };
        this.socket.connect();
      }
    }
  }

  private async waitForConnection(): Promise<void> {
    if (!this.socket) throw new Error('Socket not initialized');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 5000);

      this.socket!.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket!.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  joinChannel(channelId: string): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');
    this.socket.emit('join-channel', channelId);
  }

  leaveChannel(channelId: string): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');
    this.socket.emit('leave-channel', channelId);
  }

  sendMessage(
    messageId: string,
    channelId: string,
    content: string,
    fileData?: {
      fileUrl: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    },
    replyToId?: string,
    callbacks?: MessageCallbacks
  ): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');

    const message = {
      type: 'message',
      messageId,
      channelId,
      message: {
        content,
        fileUrl: fileData?.fileUrl,
        fileName: fileData?.fileName,
        fileType: fileData?.fileType,
        fileSize: fileData?.fileSize,
        replyToId
      }
    };

    if (callbacks) {
      this.messageCallbacks.set(messageId, callbacks);
    }

    this.socket.emit('message', message);

    // Set up timeout to clean up callbacks
    setTimeout(() => {
      if (this.messageCallbacks.has(messageId)) {
        const callbacks = this.messageCallbacks.get(messageId);
        callbacks?.onError?.(messageId, 'Message delivery timeout');
        this.messageCallbacks.delete(messageId);
      }
    }, 10000); // 10 second timeout
  }

  setMessageHandler(handler: (message: Message) => void): void {
    this.onMessageHandler = handler;
  }

  setMessageDeleteHandler(handler: (event: { messageId: string; originalId?: string }) => void): void {
    this.onMessageDeleteHandler = handler;
  }

  disconnect(): void {
    if (this.socket) {
      // No need to manually set offline status - webhook will handle it
      this.socket.disconnect();
      this.socket = null;
      this.token = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  deleteMessage(messageId: string): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');
    
    // Send deletion request to server
    this.socket.emit('message-deleted', messageId);
    
    // Trigger immediate local update
    if (this.onMessageDeleteHandler) {
      this.onMessageDeleteHandler({ messageId });
    }
  }

  updateStatus(status: 'online' | 'away' | 'busy' | 'offline'): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');
    
    // Get current user ID for logging
    const userId = this.getCurrentUserId();
    console.log('Sending status update:', { userId, status });
    
    // Emit status update to server
    this.socket.emit('status-update', status);
  }

  setStatusChangeHandler(handler: (userId: string, status: 'online' | 'away' | 'busy' | 'offline') => void): void {
    this.onStatusChangeHandler = handler;
  }

  addReaction(channelId: string, messageId: string, content: string): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');
    
    const optimisticId = `optimistic-${Date.now()}`;
    
    this.socket.emit('add-reaction', {
      type: 'reaction',
      channelId,
      messageId,
      reaction: {
        id: optimisticId, // Add optimistic ID here
        content,
        optimisticId // Add this to help track optimistic updates
      }
    });
  }

  removeReaction(channelId: string, messageId: string, reactionId: string): void {
    if (!this.socket?.connected) throw new Error('Socket not connected');
    
    this.socket.emit('remove-reaction', {
      type: 'reaction',
      channelId,
      messageId,
      reaction: {
        id: reactionId,
        user: null // We don't need user info for removal
      }
    });
  }

  setReactionAddedHandler(handler: (event: { messageId: string; reaction: Reaction }) => void): void {
    this.onReactionAddedHandler = handler;
  }

  setReactionRemovedHandler(handler: (event: { messageId: string; reaction: Reaction }) => void): void {
    this.onReactionRemovedHandler = handler;
  }

  getCurrentUserId(): string | null {
    if (!this.socket) return null;
    
    // First try to get from auth object
    const authUserId = (this.socket.auth as { userId?: string })?.userId;
    if (authUserId) return authUserId;
    
    // Fallback to parsing from token if auth is not set
    if (this.token) {
      try {
        const tokenParts = this.token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          return payload.sub;
        }
      } catch (error) {
        console.error('Error parsing token:', error);
      }
    }
    
    return null;
  }
} 