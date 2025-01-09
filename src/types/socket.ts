// src/types/socket.ts

import type { Message } from './index';

export interface MessageEvent {
  type: 'message';
  channelId: string;
  messageId: string;
  message: Message;
}

export interface MessageDeliveryEvent {
  messageId: string;
  channelId: string;
  timestamp: string;
}

export interface MessageErrorEvent {
  error: string;
  code: string;
  channelId?: string;
}

export interface ChannelEvent {
  channelId: string;
  userId: string;
  timestamp: string;
}

export interface TypingEvent {
  channelId: string;
  userId: string;
  timestamp: string;
}

export interface MessageDeletedEvent {
  messageId: string;
  channelId: string;
  timestamp: string;
}

export interface ServerToClientEvents {
  'message': (event: MessageEvent) => void;
  'message-delivered': (event: MessageDeliveryEvent) => void;
  'message-error': (event: MessageErrorEvent) => void;
  'message-deleted': (event: MessageDeletedEvent) => void;
  'channel-joined': (event: ChannelEvent) => void;
  'channel-left': (event: ChannelEvent) => void;
  'typing-start': (event: TypingEvent) => void;
  'typing-stop': (event: TypingEvent) => void;
}

export interface ClientToServerEvents {
  'message': (event: MessageEvent) => void;
  'message-delivered': (event: MessageDeliveryEvent) => void;
  'message-error': (event: MessageErrorEvent) => void;
  'message-deleted': (messageId: string) => void;
  'join-channel': (channelId: string) => void;
  'leave-channel': (channelId: string) => void;
  'send-message': (messageId: string, channelId: string, content: string) => void;
  'typing-start': (channelId: string) => void;
  'typing-stop': (channelId: string) => void;
} 