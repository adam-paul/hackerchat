// src/types/index.ts

export type Channel = {
  id: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  originalId?: string;
  creatorId: string;
  _count?: {
    messages: number;
  };
  _remove?: boolean;
};

export interface Reaction {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
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
    name: string;
    imageUrl?: string;
  };
  reactions: Reaction[];
  replyTo?: {
    id: string;
    content: string;
    author: {
      id: string;
      name: string;
    };
  };
  replyToId?: string;
  originalId?: string;
  threadId?: string;
  threadName?: string;
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
  | { type: 'ADD_REACTION'; payload: { messageId: string; reaction: Reaction } }
  | { type: 'REMOVE_REACTION'; payload: { messageId: string; reactionId: string } }
  | { type: 'CLEAR_MESSAGES' };

export interface User {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
  status?: 'online' | 'offline' | 'away' | 'busy';
}
  