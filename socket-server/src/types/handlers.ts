// socket-server/src/types/handlers.ts

import { z } from 'zod';
import type { Socket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';

export interface SocketData {
  userId: string;
  userName?: string;
  imageUrl?: string;
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
}

export interface ChannelPayload {
  channelId: string;
}

export const messageSchema = z.object({
  messageId: z.string(),
  content: z.string(),
  channelId: z.string(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().optional()
});

export const channelSchema = z.object({
  channelId: z.string()
}); 