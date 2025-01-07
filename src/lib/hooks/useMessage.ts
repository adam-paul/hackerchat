// src/lib/hooks/useMessages.ts

import { useReducer, useCallback } from 'react';
import type { Message, MessageState, MessageAction } from '@/types';

const initialState: MessageState = {
  messages: [],
  status: 'idle',
  error: undefined
};

function messageReducer(state: MessageState, action: MessageAction): MessageState {
  switch (action.type) {
    case 'FETCH_START':
      return {
        ...state,
        status: 'loading',
        error: undefined
      };
    
    case 'FETCH_SUCCESS':
      return {
        messages: action.payload,
        status: 'success',
        error: undefined
      };
    
    case 'FETCH_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.payload
      };
    
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload].slice(0, 50), // Keep last 50 messages
        status: 'success'
      };
    
    case 'UPDATE_MESSAGE': {
      const updatedMessages = state.messages.map(msg => 
        msg.id === action.payload.id ? action.payload.message : msg
      );
      return {
        ...state,
        messages: updatedMessages
      };
    }
    
    case 'CLEAR_MESSAGES':
      return initialState;
    
    default:
      return state;
  }
}

export function useMessages() {
  const [state, dispatch] = useReducer(messageReducer, initialState);

  const startLoading = useCallback(() => {
    dispatch({ type: 'FETCH_START' });
  }, []);

  const setMessages = useCallback((messages: Message[]) => {
    dispatch({ type: 'FETCH_SUCCESS', payload: messages });
  }, []);

  const addMessage = useCallback((message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  }, []);

  const updateMessage = useCallback((id: string, message: Message) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, message } });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'FETCH_ERROR', payload: error });
  }, []);

  return {
    ...state,
    startLoading,
    setMessages,
    addMessage,
    updateMessage,
    clearMessages,
    setError
  };
}
