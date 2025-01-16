// socket-server/src/types/handlers.ts

import { z } from 'zod';
import type { Socket } from 'socket.io';
import type { DefaultEventsMap } from '@socket.io/component-emitter';

export interface SocketData {
  userId: string;
  userName: string;
  imageUrl: string | null;
}

export type SocketType = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export interface HandlerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MessagePayload {
  messageId: string;
  content: string;
  channelId: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  replyToId?: string;
}

export interface ChannelPayload {
  channelId: string;
}

export interface CreateChannelPayload {
  name: string;
  parentId?: string;
  description?: string;
  originalId?: string;
  sourceMessageId?: string;
  initialContent?: string;
}

export interface UpdateChannelPayload {
  channelId: string;
  name?: string;
  description?: string;
}

export interface DeleteChannelPayload {
  channelId: string;
}

export const messageSchema = z.object({
  messageId: z.string(),
  content: z.string(),
  channelId: z.string(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().optional(),
  replyToId: z.string().optional()
});

export const channelSchema = z.object({
  channelId: z.string()
});

export const createChannelSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
  description: z.string().optional(),
  originalId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  initialContent: z.string().optional()
});

export const updateChannelSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional()
});

export const deleteChannelSchema = z.object({
  channelId: z.string()
}); 