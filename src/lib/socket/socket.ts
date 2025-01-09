import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../types/socket';

type EventsMap = ServerToClientEvents & {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  'socket.reconnect': (attemptNumber: number) => void;
};

export class SocketManager {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private tokenProvider: () => Promise<string | null>;
  private connectionAttempts = 0;
  private maxRetries = 5;
  private retryDelay = 1000;
  private listeners = new Map<keyof EventsMap, Set<Function>>();

  constructor(tokenProvider: () => Promise<string | null>) {
    this.tokenProvider = tokenProvider;
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    try {
      const token = await this.tokenProvider();
      if (!token) {
        throw new Error('No authentication token available');
      }

      this.socket = io('http://localhost:4000', {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: this.maxRetries,
        reconnectionDelay: this.retryDelay,
        timeout: 10000,
        transports: ['websocket']
      });

      this.setupEventHandlers();
      await this.waitForConnection();
      this.connectionAttempts = 0;
    } catch (error) {
      console.error('Socket connection error:', error);
      this.handleConnectionError();
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connectionAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, attempt reconnection
        this.connect();
      }
    });

    this.socket.on('connect_error', async (error) => {
      console.error('Socket connection error:', error);
      if (error.message === 'invalid token') {
        // Token expired or invalid, get new token and reconnect
        const newToken = await this.tokenProvider();
        if (newToken && this.socket) {
          this.socket.auth = { token: newToken };
          this.socket.connect();
        }
      }
    });

    // Restore event listeners after reconnection
    (this.socket as any).on('socket.reconnect', () => {
      console.log('Socket reconnected');
      this.listeners.forEach((handlers, event) => {
        handlers.forEach(handler => {
          if (this.socket) {
            this.socket.on(event as keyof ServerToClientEvents, handler as any);
          }
        });
      });
    });
  }

  private async waitForConnection(): Promise<void> {
    if (!this.socket) throw new Error('Socket not initialized');
    const socket = this.socket;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private handleConnectionError() {
    this.connectionAttempts++;
    if (this.connectionAttempts < this.maxRetries) {
      const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
      setTimeout(() => this.connect(), delay);
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.listeners.clear();
  }

  on<T extends keyof ServerToClientEvents>(
    event: T,
    handler: ServerToClientEvents[T]
  ) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.add(handler as Function);
    }
    this.socket?.on(event, handler as any);

    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler as Function);
      }
      this.socket?.off(event, handler as any);
    };
  }

  emit<T extends keyof ClientToServerEvents>(
    event: T,
    ...args: Parameters<ClientToServerEvents[T]>
  ) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit(event, ...args);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
} 