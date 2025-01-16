// src/lib/socket/service.ts

import { io, Socket } from 'socket.io-client';
import type { Message, Reaction, Channel } from '@/types';

interface MessageCallbacks {
  onDelivered?: (messageId: string) => void;
  onError?: (messageId: string, error: string) => void;
  onMessage?: (message: Message) => void;
}

interface ChannelCallbacks {
  onCreated?: (channel: Channel) => void;
  onUpdated?: (channel: Channel) => void;
  onDeleted?: (channelId: string) => void;
  onError?: (error: string) => void;
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
  private onMessageUpdateHandler?: (event: { messageId: string; threadId?: string; threadMetadata?: { title: string; createdAt: string } }) => void;
  private onStatusChangeHandler?: (event: { userId: string; status: 'online' | 'away' | 'busy' | 'offline' }) => void;
  private onReactionAddedHandler?: (event: { messageId: string; reaction: Reaction }) => void;
  private onReactionRemovedHandler?: (event: { messageId: string; reaction: Reaction }) => void;
  private onChannelCreatedHandler?: (channel: Channel) => void;
  private onChannelUpdatedHandler?: (channel: Channel) => void;
  private onChannelDeletedHandler?: (event: { channelId: string; timestamp: string }) => void;
  private channelCallbacks: Map<string, ChannelCallbacks> = new Map();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000;

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

    this.socket.on('message', (event: any) => {
      if (this.onMessageHandler) {
        // Handle both direct messages and message events
        const message = event.message || event;
        
        // Validate message structure
        if (!message || typeof message !== 'object') {
          console.error('Invalid message received:', event);
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

        this.onMessageHandler(message);
      }
    });

    this.socket.on('status-changed', (event: { userId: string, status: 'online' | 'away' | 'busy' | 'offline' }) => {
      if (this.onStatusChangeHandler) {
        this.onStatusChangeHandler(event);
      }
    });

    this.socket.on('message-delivered', (event) => {
      const callbacks = this.messageCallbacks.get(event.originalId || event.messageId);
      if (callbacks) {
        callbacks.onDelivered?.(event.messageId);
        // Always update the message when we receive a delivery confirmation
        if (this.onMessageHandler && event.message) {
          // Update the message with the permanent ID and any reply info
          this.onMessageHandler({
            ...event.message,
            originalId: event.originalId // Keep track of the original ID for reference
          });
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

    // Handle reaction events
    this.socket.on('reaction-added', (event) => {
      if (this.onReactionAddedHandler) {
        // Skip if this is our own reaction (we already handled it optimistically)
        const userId = (this.socket?.auth as { userId?: string })?.userId;
        if (event.reaction?.user?.id === userId) {
          return;
        }
        this.onReactionAddedHandler(event);
      }
    });

    this.socket.on('reaction-removed', (event) => {
      if (this.onReactionRemovedHandler) {
        // Skip if this is our own reaction (we already handled it optimistically)
        const userId = (this.socket?.auth as { userId?: string })?.userId;
        if (event.reaction?.user?.id === userId) {
          return;
        }
        this.onReactionRemovedHandler(event);
      }
    });

    // Channel event handlers with callback support
    this.socket.on('channel-created', (channel) => {
      if (this.onChannelCreatedHandler) {
        this.onChannelCreatedHandler(channel);
      }
      const callbacks = this.channelCallbacks.get(channel.originalId || channel.id);
      callbacks?.onCreated?.(channel);
      this.channelCallbacks.delete(channel.originalId || channel.id);
    });

    this.socket.on('channel-updated', (channel) => {
      if (this.onChannelUpdatedHandler) {
        this.onChannelUpdatedHandler(channel);
      }
      const callbacks = this.channelCallbacks.get(channel.id);
      callbacks?.onUpdated?.(channel);
      this.channelCallbacks.delete(channel.id);
    });

    this.socket.on('channel-deleted', (event) => {
      if (this.onChannelDeletedHandler) {
        this.onChannelDeletedHandler(event);
      }
      const callbacks = this.channelCallbacks.get(event.channelId);
      callbacks?.onDeleted?.(event.channelId);
      this.channelCallbacks.delete(event.channelId);
    });

    this.socket.on('message-updated', (event) => {
      if (this.onMessageUpdateHandler) {
        this.onMessageUpdateHandler(event);
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

  // Channel operations with error handling and retries
  async createChannel(name: string, parentId?: string, description?: string, callbacks?: ChannelCallbacks): Promise<void> {
    if (!this.socket?.connected) throw new Error('Socket not connected');

    const tempId = `temp_${name}`;
    
    // Register callbacks before emitting
    if (callbacks) {
      this.channelCallbacks.set(tempId, callbacks);
    }

    let attempts = 0;
    const attemptOperation = async () => {
      try {
        this.socket!.emit('create-channel', { 
          name, 
          parentId, 
          description,
          originalId: tempId
        });
      } catch (error) {
        if (attempts < this.MAX_RETRY_ATTEMPTS) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          return attemptOperation();
        }
        // Clean up callback if operation fails
        this.channelCallbacks.delete(tempId);
        callbacks?.onError?.(error instanceof Error ? error.message : 'Failed to create channel');
        throw error;
      }
    };

    await attemptOperation();
  }

  async updateChannel(channelId: string, updates: { name?: string; description?: string }, callbacks?: ChannelCallbacks): Promise<void> {
    if (!this.socket?.connected) throw new Error('Socket not connected');

    if (callbacks) {
      this.channelCallbacks.set(channelId, callbacks);
    }

    let attempts = 0;
    const attemptOperation = async () => {
      try {
        this.socket!.emit('update-channel', { channelId, ...updates });
      } catch (error) {
        if (attempts < this.MAX_RETRY_ATTEMPTS) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          return attemptOperation();
        }
        callbacks?.onError?.(error instanceof Error ? error.message : 'Failed to update channel');
        throw error;
      }
    };

    await attemptOperation();
  }

  async deleteChannel(channelId: string, callbacks?: ChannelCallbacks): Promise<void> {
    if (!this.socket?.connected) throw new Error('Socket not connected');

    if (callbacks) {
      this.channelCallbacks.set(channelId, callbacks);
    }

    let attempts = 0;
    const attemptOperation = async () => {
      try {
        this.socket!.emit('delete-channel', { channelId });
      } catch (error) {
        if (attempts < this.MAX_RETRY_ATTEMPTS) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          return attemptOperation();
        }
        callbacks?.onError?.(error instanceof Error ? error.message : 'Failed to delete channel');
        throw error;
      }
    };

    await attemptOperation();
  }

  // Channel event handlers
  setChannelCreatedHandler(handler: (channel: Channel) => void): void {
    this.onChannelCreatedHandler = handler;
  }

  setChannelUpdatedHandler(handler: (channel: Channel) => void): void {
    this.onChannelUpdatedHandler = handler;
  }

  setChannelDeletedHandler(handler: (event: { channelId: string; timestamp: string }) => void): void {
    this.onChannelDeletedHandler = handler;
  }

  setMessageUpdateHandler(handler: (event: { messageId: string; threadId?: string; threadMetadata?: { title: string; createdAt: string } }) => void): void {
    this.onMessageUpdateHandler = handler;
  }

  updateMessage(messageId: string, updates: { threadId?: string; threadMetadata?: { title: string; createdAt: string } }): void {
    if (!this.socket) return;
    this.socket.emit('message-updated', { messageId, ...updates });
  }
} 