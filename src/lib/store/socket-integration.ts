// src/lib/store/socket-integration.ts
'use client';

import type { Channel } from '@/types';
import type { SocketService } from '@/lib/socket/service';
import { useChannelStore } from './channel';

// Ensure this only runs on the client
const isClient = typeof window !== 'undefined';

export function setupSocketIntegration(socket: SocketService) {
  if (!isClient) return () => {};

  // Initialize socket in store
  useChannelStore.getState()._initSocket(socket);

  // Define event handlers using store.setState
  const handleChannelCreated = (channel: Channel) => {
    useChannelStore.setState(state => {
      const optimisticUpdate = state.optimisticUpdates.get(channel.originalId || '');
      
      if (optimisticUpdate) {
        // Replace optimistic with real
        return {
          channels: state.channels.map(c => 
            c.id === optimisticUpdate.data.id ? channel : c
          ),
          optimisticUpdates: new Map(
            Array.from(state.optimisticUpdates.entries())
              .filter(([key]) => key !== (channel.originalId || ''))
          )
        };
      } else {
        // Add new channel
        return {
          channels: [...state.channels, channel].sort((a, b) => a.name.localeCompare(b.name))
        };
      }
    });
  };

  const handleChannelDeleted = (event: { channelId: string; timestamp: string }) => {
    useChannelStore.setState(state => {
      // Helper function to check if a channel is a descendant
      const isDescendant = (id: string, ancestorId: string): boolean => {
        const channel = state.channels.find(c => c.id === id);
        if (!channel) return false;
        if (channel.parentId === ancestorId) return true;
        return channel.parentId ? isDescendant(channel.parentId, ancestorId) : false;
      };

      // Remove channel and its descendants
      return {
        channels: state.channels.filter(c => 
          c.id !== event.channelId && !isDescendant(c.id, event.channelId)
        ),
        optimisticUpdates: new Map(
          Array.from(state.optimisticUpdates.entries())
            .filter(([key]) => key !== event.channelId)
        )
      };
    });

    // If deleted channel was selected, clear selection
    const currentState = useChannelStore.getState();
    if (currentState.selectedChannelId === event.channelId) {
      useChannelStore.setState({ selectedChannelId: null });
    }
  };

  const handleChannelUpdated = (channel: Channel) => {
    useChannelStore.setState(state => {
      const optimisticUpdate = state.optimisticUpdates.get(channel.id);
      if (optimisticUpdate) {
        return {
          channels: state.channels.map(c => 
            c.id === channel.id ? channel : c
          ),
          optimisticUpdates: new Map(
            Array.from(state.optimisticUpdates.entries())
              .filter(([key]) => key !== channel.id)
          )
        };
      } else {
        return {
          channels: state.channels.map(c => 
            c.id === channel.id ? channel : c
          )
        };
      }
    });
  };

  const handleError = (error: string) => {
    useChannelStore.setState({ error });
  };

  const handleReconnect = () => {
    // Re-fetch channels on reconnect
    fetch('/api/channels')
      .then(res => res.json())
      .then(channels => {
        useChannelStore.setState({ channels });
      })
      .catch(error => {
        useChannelStore.setState({ 
          error: error instanceof Error ? error.message : 'Failed to fetch channels' 
        });
      });
  };

  // Set up event handlers
  socket.setChannelCreatedHandler(handleChannelCreated);
  socket.setChannelUpdatedHandler(handleChannelUpdated);
  socket.setChannelDeletedHandler(handleChannelDeleted);

  // Set up error and reconnect handlers
  socket.on('error', handleError);
  socket.on('socket.reconnect', handleReconnect);

  // Return cleanup function
  return () => {
    socket.setChannelCreatedHandler(() => {});
    socket.setChannelUpdatedHandler(() => {});
    socket.setChannelDeletedHandler(() => {});
    socket.off('error', handleError);
    socket.off('socket.reconnect', handleReconnect);
  };
}
