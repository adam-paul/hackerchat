// src/lib/hooks/useMessage.ts

import { useCallback, useReducer, useEffect } from 'react';
import type { Message, MessageState, MessageAction } from '@/types';
import { useSocket } from '../socket/context';

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
        ...state,
        status: 'success',
        messages: action.payload,
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
        status: 'success',
        messages: [...state.messages, action.payload]
      };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg =>
          msg.id === action.payload.id ? action.payload.message : 
          // Also update any messages that reply to this message
          msg.replyTo?.id === action.payload.id || msg.replyToId === action.payload.id ? {
            ...msg,
            replyToId: msg.replyToId === action.payload.id ? action.payload.message.id : msg.replyToId,
            replyTo: msg.replyTo?.id === action.payload.id ? {
              ...msg.replyTo,
              id: action.payload.message.id
            } : msg.replyTo
          } : msg
        )
      };
    case 'DELETE_MESSAGE':
      return {
        ...state,
        status: 'success',
        messages: state.messages.filter(msg => msg.id !== action.payload)
      };
    case 'MESSAGE_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.payload.error
      };
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        status: 'idle',
        messages: [],
        error: undefined
      };
    default:
      return state;
  }
}

export function useMessages() {
  const [state, dispatch] = useReducer(messageReducer, initialState);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message: Message) => {
      dispatch({ type: 'ADD_MESSAGE', payload: message });
    };

    const handleMessageDeleted = (event: { messageId: string; originalId?: string }) => {
      // Delete both the real message and any optimistic version
      dispatch({ type: 'DELETE_MESSAGE', payload: event.messageId });
      if (event.originalId) {
        dispatch({ type: 'DELETE_MESSAGE', payload: event.originalId });
      }
    };

    socket.setMessageHandler(handleMessage);
    socket.setMessageDeleteHandler(handleMessageDeleted);

    return () => {
      socket.setMessageHandler(() => {});
      socket.setMessageDeleteHandler(() => {});
    };
  }, [socket]);

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
    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: { id, message }
    });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'FETCH_ERROR', payload: error });
  }, []);

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    startLoading,
    setMessages,
    addMessage,
    updateMessage,
    clearMessages,
    setError
  };
}
