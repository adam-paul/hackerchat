// src/lib/hooks/useMessage.ts

import { useCallback, useReducer, useEffect, useRef } from 'react';
import type { Message, Reaction } from '@/types';
import { useSocket } from '../socket/context';

type MessageState = {
  messages: Message[];
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
  currentChannelId: string | null;
};

type MessageAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Message[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; message: Message } }
  | { type: 'UPDATE_THREAD_METADATA'; payload: { messageId: string; threadId?: string; threadMetadata?: { title: string; createdAt: string } } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'MESSAGE_ERROR'; payload: { error: string } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'ADD_REACTION'; payload: { messageId: string; reaction: Reaction } }
  | { type: 'REMOVE_REACTION'; payload: { messageId: string; reactionId: string } }
  | { type: 'SET_CHANNEL'; payload: string | null };

const initialState: MessageState = {
  messages: [],
  status: 'idle',
  error: undefined,
  currentChannelId: null
};

function messageReducer(state: MessageState, action: MessageAction): MessageState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, status: 'loading', error: undefined };
    case 'FETCH_SUCCESS':
      return { ...state, messages: action.payload, status: 'success', error: undefined };
    case 'FETCH_ERROR':
      return { ...state, status: 'error', error: action.payload };
    case 'SET_CHANNEL':
      return {
        ...state,
        currentChannelId: action.payload,
        messages: state.messages.filter(msg => msg.channelId === action.payload)
      };
    case 'ADD_MESSAGE':
      if (state.currentChannelId && action.payload.channelId !== state.currentChannelId) {
        return state;
      }
      return {
        ...state,
        status: 'success',
        messages: [...state.messages, action.payload].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg => {
          // Match by either ID or originalId
          if (msg.id === action.payload.id || msg.originalId === action.payload.id) {
            return {
              ...action.payload.message,
              // Preserve the original ID mapping
              originalId: msg.originalId || msg.id
            };
          }
          return msg;
        })
      };
    case 'DELETE_MESSAGE':
      return {
        ...state,
        status: 'success',
        messages: state.messages.filter(msg => 
          msg.id !== action.payload && msg.originalId !== action.payload
        )
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
        error: undefined,
        currentChannelId: null
      };
    case 'ADD_REACTION':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg => 
          msg.id === action.payload.messageId || msg.originalId === action.payload.messageId
            ? {
                ...msg,
                reactions: [...(msg.reactions || []), action.payload.reaction]
              }
            : msg
        )
      };
    case 'REMOVE_REACTION':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg => 
          msg.id === action.payload.messageId || msg.originalId === action.payload.messageId
            ? {
                ...msg,
                reactions: (msg.reactions || []).filter(r => r.id !== action.payload.reactionId)
              }
            : msg
        )
      };
    case 'UPDATE_THREAD_METADATA':
      return {
        ...state,
        messages: state.messages.map(msg => 
          msg.id === action.payload.messageId || msg.originalId === action.payload.messageId
            ? {
                ...msg,
                threadId: action.payload.threadId,
                threadMetadata: action.payload.threadMetadata
              }
            : msg
        )
      };
    default:
      return state;
  }
}

export function useMessages() {
  const [state, dispatch] = useReducer(messageReducer, initialState);
  const { socket } = useSocket();
  
  // Message handlers
  const handleMessage = useCallback((message: Message) => {
    if (message.originalId) {
      // This is a permanent message replacing a temporary one
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          id: message.originalId,  // Find by temp ID
          message: {
            ...message,
            originalId: message.originalId  // Keep the original temp ID
          }
        }
      });
    } else {
      // This is a new message
      dispatch({ type: 'ADD_MESSAGE', payload: message });
    }
  }, []);

  const handleMessageDeleted = useCallback((event: { messageId: string; originalId?: string }) => {
    console.log('[useMessages] Handling message deletion:', event.messageId);
    dispatch({ type: 'DELETE_MESSAGE', payload: event.messageId });
    if (event.originalId) {
      dispatch({ type: 'DELETE_MESSAGE', payload: event.originalId });
    }
  }, []);

  const handleReactionAdded = useCallback((event: { messageId: string; reaction: Reaction; optimisticId?: string }) => {
    console.log('[useMessages] Handling reaction added:', event.messageId);
    dispatch({ type: 'ADD_REACTION', payload: event });
  }, []);

  const handleReactionRemoved = useCallback((event: { messageId: string; reaction: Reaction }) => {
    console.log('[useMessages] Handling reaction removed:', event.messageId);
    dispatch({ type: 'REMOVE_REACTION', payload: { 
      messageId: event.messageId, 
      reactionId: event.reaction.id 
    }});
  }, []);

  // Keep track of handlers in a ref to avoid recreating effect
  const handlersRef = useRef({
    handleMessage,
    handleMessageDeleted,
    handleReactionAdded,
    handleReactionRemoved
  });

  // Simplified message update handler
  const handleMessageUpdated = useCallback((event: { messageId: string; threadId?: string; threadMetadata?: { title: string; createdAt: string } }) => {
    dispatch({ type: 'UPDATE_THREAD_METADATA', payload: event });
  }, []);

  // Register socket handlers whenever socket changes
  useEffect(() => {
    if (!socket) return;

    // Register all handlers
    socket.setMessageHandler(handlersRef.current.handleMessage);
    socket.setMessageDeleteHandler(handlersRef.current.handleMessageDeleted);
    socket.setReactionAddedHandler(handlersRef.current.handleReactionAdded);
    socket.setReactionRemovedHandler(handlersRef.current.handleReactionRemoved);
    socket.setMessageUpdateHandler(handleMessageUpdated);

    // Cleanup function
    return () => {
      if (!socket.isConnected()) {
        socket.setMessageHandler(() => {});
        socket.setMessageDeleteHandler(() => {});
        socket.setReactionAddedHandler(() => {});
        socket.setReactionRemovedHandler(() => {});
        socket.setMessageUpdateHandler(() => {});
      }
    };
  }, [socket, handleMessageUpdated]);

  const startLoading = useCallback(() => {
    dispatch({ type: 'FETCH_START' });
  }, []);

  const setMessages = useCallback((messages: Message[]) => {
    dispatch({ type: 'FETCH_SUCCESS', payload: messages });
  }, []);

  const addMessage = useCallback((message: Message) => {
    // Validate message before adding to state
    if (!message || typeof message !== 'object') {
      console.error('Invalid message received:', message);
      return;
    }

    // Ensure required fields exist
    if (!message.id || !message.channelId || !message.author) {
      console.error('Message missing required fields:', message);
      return;
    }

    // Ensure author has required fields
    if (!message.author.id) {
      console.error('Message author missing required fields:', message);
      return;
    }

    dispatch({ type: 'ADD_MESSAGE', payload: message });
  }, []);

  const updateMessage = useCallback((id: string, message: Message) => {
    // Validate message before updating
    if (!message || typeof message !== 'object') {
      console.error('Invalid message update received:', message);
      return;
    }

    // Ensure required fields exist
    if (!message.id || !message.channelId || !message.author) {
      console.error('Message update missing required fields:', message);
      return;
    }

    // Ensure author has required fields
    if (!message.author.id) {
      console.error('Message author missing required fields:', message);
      return;
    }

    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: { id, message }
    });
  }, []);

  const updateMessageFields = useCallback((id: string, updates: { threadId?: string; threadMetadata?: { title: string; createdAt: string } }) => {
    dispatch({
      type: 'UPDATE_THREAD_METADATA',
      payload: { messageId: id, ...updates }
    });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'FETCH_ERROR', payload: error });
  }, []);

  const setCurrentChannel = useCallback((channelId: string | null) => {
    dispatch({ type: 'SET_CHANNEL', payload: channelId });
  }, []);

  useEffect(() => {
    handlersRef.current = {
      handleMessage,
      handleMessageDeleted,
      handleReactionAdded,
      handleReactionRemoved
    };
  }, [handleMessage, handleMessageDeleted, handleReactionAdded, handleReactionRemoved]);

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    startLoading,
    setMessages,
    addMessage,
    updateMessage,
    updateMessageFields,
    clearMessages,
    setError,
    setCurrentChannel
  };
}
