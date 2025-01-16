// src/lib/socket/service.ts

import { io, Socket } from 'socket.io-client';
import type { Message, Reaction, Channel } from '@/types';

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
  private onStatusChangeHandler?: (event: { userId: string; status: 'online' | 'away' | 'busy' | 'offline' }) => void;
  private onReactionAddedHandler?: (event: { messageId: string; reaction: Reaction }) => void;
  private onReactionRemovedHandler?: (event: { messageId: string; reaction: Reaction }) => void;
  private onChannelCreatedHandler?: (channel: Channel) => void;
  private onChannelDeletedHandler?: (channelId: string) => void;
  private onChannelUpdatedHandler?: (channel: Channel) => void;

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
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error: string) => {
      console.error('Socket error:', error);
    });

    this.socket.on('message', (message: Message) => {
      this.onMessageHandler?.(message);
      this.messageCallbacks.get(message.id)?.onMessage?.(message);
    });

    this.socket.on('message-delivered', (messageId: string) => {
      this.messageCallbacks.get(messageId)?.onDelivered?.(messageId);
    });

    this.socket.on('message-error', (event: { messageId: string; error: string }) => {
      this.messageCallbacks.get(event.messageId)?.onError?.(event.messageId, event.error);
    });

    this.socket.on('message-deleted', (event: { messageId: string; originalId?: string }) => {
      this.onMessageDeleteHandler?.(event);
    });

    this.socket.on('status-changed', (event: { userId: string; status: 'online' | 'away' | 'busy' | 'offline' }) => {
      this.onStatusChangeHandler?.(event);
    });

    this.socket.on('reaction-added', (event: { messageId: string; reaction: Reaction }) => {
      this.onReactionAddedHandler?.(event);
    });

    this.socket.on('reaction-removed', (event: { messageId: string; reaction: Reaction }) => {
      this.onReactionRemovedHandler?.(event);
    });

    this.socket.on('channel-created', (channel: Channel) => {
      this.onChannelCreatedHandler?.(channel);
    });

    this.socket.on('channel-deleted', (channelId: string) => {
      this.onChannelDeletedHandler?.(channelId);
    });

    this.socket.on('channel-updated', (channel: Channel) => {
      this.onChannelUpdatedHandler?.(channel);
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
    // Wrap handler with validation
    this.onMessageHandler = (message: Message) => {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        console.error('Invalid message received:', message);
        return;
      }

      // Ensure required fields exist
      if (!message.id || !message.channelId || !message.author) {
        console.error('Message missing required fields:', message);
        return;
      }

      // Ensure author has required fields
      if (!message.author.id) {
        console.error('Message author missing required fields:', message);
        return;
      }

      handler(message);
    };
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
    if (!this.socket) return;
    const userId = this.getCurrentUserId();
    if (!userId) return;
    
    this.socket.emit('status-update', status);
  }

  setStatusChangeHandler(handler: (event: { userId: string; status: 'online' | 'away' | 'busy' | 'offline' }) => void): void {
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

  setChannelCreatedHandler(handler: (channel: Channel) => void): void {
    this.onChannelCreatedHandler = handler;
  }

  setChannelDeletedHandler(handler: (channelId: string) => void): void {
    this.onChannelDeletedHandler = handler;
  }

  setChannelUpdatedHandler(handler: (channel: Channel) => void): void {
    this.onChannelUpdatedHandler = handler;
  }
} 