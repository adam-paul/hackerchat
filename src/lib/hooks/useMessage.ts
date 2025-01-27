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
  | { type: 'ADD_REACTION'; payload: { messageId: string; originalId?: string; reaction: Reaction } }
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
      // Check if we already have this message (by either ID)
      const existingMessage = state.messages.find(m => 
        m.id === action.payload.id || 
        m.originalId === action.payload.id ||
        (action.payload.originalId && (m.id === action.payload.originalId || m.originalId === action.payload.originalId))
      );

      if (existingMessage) {
        // Update existing message but preserve originalId
        return {
          ...state,
          status: 'success',
          messages: state.messages.map(msg => 
            msg.id === existingMessage.id ? {
              ...action.payload,
              originalId: existingMessage.originalId || action.payload.originalId
            } : msg
          )
        };
      }

      // Add new message
      return {
        ...state,
        status: 'success',
        messages: [...state.messages, {
          ...action.payload,
          originalId: action.payload.originalId || (action.payload.id.startsWith('temp_') ? action.payload.id : undefined)
        }]
      };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg => {
          // If this is the message being updated
          if (msg.id === action.payload.id || msg.id === action.payload.message.originalId) {
            return action.payload.message;
          }
          
          // If this message replies to the updated message
          if (msg.replyTo?.id === action.payload.id || msg.replyToId === action.payload.id) {
            return {
              ...msg,
              replyToId: action.payload.message.id,
              replyTo: {
                id: action.payload.message.id,
                content: action.payload.message.content,
                author: action.payload.message.author
              }
            };
          }

          return msg;
        })
      };
    case 'DELETE_MESSAGE':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg => {
          // If this is the message being deleted, filter it out
          if (msg.id === action.payload) {
            return null;
          }
          // If this message replies to the deleted message, remove the reply link
          if (msg.replyTo?.id === action.payload || msg.replyToId === action.payload) {
            return {
              ...msg,
              replyToId: null,
              replyTo: null
            };
          }
          return msg;
        }).filter(Boolean) as Message[]
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
          (msg.id === action.payload.messageId || 
           (action.payload.originalId && (msg.id === action.payload.originalId || msg.originalId === action.payload.originalId))) ? {
            ...msg,
            reactions: [
              ...(msg.reactions || []).filter(r => 
                !(r.id.startsWith('optimistic-') && r.content === action.payload.reaction.content)
              ),
              action.payload.reaction
            ]
          } : msg
        )
      };
    case 'REMOVE_REACTION':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId ? {
            ...msg,
            reactions: msg.reactions.filter(r => r.id !== action.payload.reactionId)
          } : msg
        )
      };
    case 'UPDATE_THREAD_METADATA':
      const updatedMessages = state.messages.map(msg => 
        msg.id === action.payload.messageId
          ? {
              ...msg,
              threadId: action.payload.threadId,
              threadName: action.payload.threadMetadata?.title
            }
          : msg
      );

      return {
        ...state,
        status: 'success',
        messages: updatedMessages
      };
    default:
      return state;
  }
}

export function useMessages() {
  const [state, dispatch] = useReducer(messageReducer, initialState);
  const { socket } = useSocket();
  
  const handleNewMessage = useCallback((message: Message) => {
    console.log('[useMessages] Handling new message:', message.id);
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  }, []);

  // Store handlers in refs to maintain them across re-renders
  const handlersRef = useRef({
    handleMessageDeleted: (event: { messageId: string; originalId?: string }) => {
      console.log('[useMessages] Handling message deletion:', event.messageId);
      dispatch({ type: 'DELETE_MESSAGE', payload: event.messageId });
      if (event.originalId) {
        dispatch({ type: 'DELETE_MESSAGE', payload: event.originalId });
      }
    },
    handleReactionAdded: (event: { messageId: string; originalId?: string; reaction: Reaction; optimisticId?: string }) => {
      console.log('[useMessages] Handling reaction added:', event.messageId);
      dispatch({ type: 'ADD_REACTION', payload: { 
        messageId: event.messageId,
        originalId: event.originalId,
        reaction: event.reaction 
      }});
    },
    handleReactionRemoved: (event: { messageId: string; reaction: Reaction }) => {
      console.log('[useMessages] Handling reaction removed:', event.messageId);
      dispatch({ type: 'REMOVE_REACTION', payload: { 
        messageId: event.messageId, 
        reactionId: event.reaction.id 
      }});
    }
  });

  // Simplified message update handler
  const handleMessageUpdated = useCallback((event: { messageId: string; threadId?: string; threadMetadata?: { title: string; createdAt: string } }) => {
    dispatch({ type: 'UPDATE_THREAD_METADATA', payload: event });
  }, []);

  // Register socket handlers whenever socket changes
  useEffect(() => {
    if (!socket) return;

    // Register all handlers
    socket.setMessageHandler(handleNewMessage);
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
  }, [socket, handleMessageUpdated, handleNewMessage]);

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
