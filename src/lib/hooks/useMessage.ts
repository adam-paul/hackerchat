// src/lib/hooks/useMessage.ts

import { useCallback, useReducer, useEffect } from 'react';
import type { Message, MessageState, MessageAction, Reaction } from '@/types';
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
