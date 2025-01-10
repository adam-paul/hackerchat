// src/types/index.ts

export interface Channel {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
  _count?: {
    messages: number;
  };
}

export interface Message {
  id: string;
  content: string;
  channelId: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
  replyToId?: string;
  replyTo?: {
    id: string;
    content: string;
    author: {
      id: string;
      name: string | null;
    };
  };
  originalId?: string;
}

export type MessageLoadingState = 'idle' | 'loading' | 'error' | 'success';

export interface MessageState {
  messages: Message[];
  status: MessageLoadingState;
  error?: string;
}

export type MessageAction = 
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Message[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; message: Message } }
  | { type: 'MESSAGE_ERROR'; payload: { messageId: string; error: string } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'CLEAR_MESSAGES' };

export interface User {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
  status?: 'online' | 'offline' | 'away' | 'busy';
}
  