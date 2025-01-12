// src/lib/hooks/useMessage.ts

import { useCallback, useReducer, useEffect } from 'react';
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
      return {
        ...state,
        status: 'success',
        messages: [...state.messages, action.payload]
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
        error: undefined,
        currentChannelId: null
      };
    case 'ADD_REACTION':
      return {
        ...state,
        status: 'success',
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId ? {
            ...msg,
            reactions: [
              ...msg.reactions.filter(r => 
                // Remove any optimistic version of this reaction
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

    const handleReactionAdded = (event: { messageId: string; reaction: Reaction; optimisticId?: string }) => {
      dispatch({ type: 'ADD_REACTION', payload: event });
    };

    const handleReactionRemoved = (event: { messageId: string; reaction: Reaction }) => {
      dispatch({ type: 'REMOVE_REACTION', payload: { 
        messageId: event.messageId, 
        reactionId: event.reaction.id 
      }});
    };

    socket.setMessageHandler(handleMessage);
    socket.setMessageDeleteHandler(handleMessageDeleted);
    socket.setReactionAddedHandler(handleReactionAdded);
    socket.setReactionRemovedHandler(handleReactionRemoved);

    return () => {
      socket.setMessageHandler(() => {});
      socket.setMessageDeleteHandler(() => {});
      socket.setReactionAddedHandler(() => {});
      socket.setReactionRemovedHandler(() => {});
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
    clearMessages,
    setError,
    setCurrentChannel
  };
}
