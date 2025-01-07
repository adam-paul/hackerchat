// src/types/index.ts

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    messages: number;
  };
}

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
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
  | { type: 'CLEAR_MESSAGES' };
  