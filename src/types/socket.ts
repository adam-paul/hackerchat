// src/types/socket.ts

import type { Message, Channel } from './index';

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

export interface ChannelCreatedEvent {
  channel: Channel;
}

export interface ChannelUpdatedEvent {
  channel: Channel;
}

export interface ChannelDeletedEvent {
  channelId: string;
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

export interface MessageUpdatedEvent {
  messageId: string;
  threadId?: string;
  threadMetadata?: {
    title: string;
    createdAt: string;
  };
}

export interface ServerToClientEvents {
  'message': (event: MessageEvent) => void;
  'message-delivered': (event: MessageDeliveryEvent) => void;
  'message-error': (event: MessageErrorEvent) => void;
  'message-deleted': (event: MessageDeletedEvent) => void;
  'message-updated': (event: MessageUpdatedEvent) => void;
  'channel-joined': (event: ChannelEvent) => void;
  'channel-left': (event: ChannelEvent) => void;
  'channel-created': (event: ChannelCreatedEvent) => void;
  'channel-updated': (event: ChannelUpdatedEvent) => void;
  'channel-deleted': (event: ChannelDeletedEvent) => void;
  'typing-start': (event: TypingEvent) => void;
  'typing-stop': (event: TypingEvent) => void;
}

export interface ClientToServerEvents {
  'message': (event: MessageEvent) => void;
  'message-delivered': (event: MessageDeliveryEvent) => void;
  'message-error': (event: MessageErrorEvent) => void;
  'message-deleted': (messageId: string) => void;
  'message-updated': (data: MessageUpdatedEvent) => void;
  'join-channel': (channelId: string) => void;
  'leave-channel': (channelId: string) => void;
  'create-channel': (data: { name: string; parentId?: string; description?: string }) => void;
  'update-channel': (data: { channelId: string; name?: string; description?: string }) => void;
  'delete-channel': (data: { channelId: string }) => void;
  'send-message': (messageId: string, channelId: string, content: string) => void;
  'typing-start': (channelId: string) => void;
  'typing-stop': (channelId: string) => void;
  'session.expired': () => void;
} 