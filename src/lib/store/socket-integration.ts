// src/lib/store/socket-integration.ts
'use client';

import type { Channel } from '@/types';
import type { SocketService } from '@/lib/socket/service';
import { useChannelStore } from './channel';

// Ensure this only runs on the client
const isClient = typeof window !== 'undefined';

export function setupSocketIntegration(socket: SocketService) {
  if (!isClient) return () => {};

  // Instead of accessing store directly, use setState
  const store = useChannelStore;

  // Define event handlers using store.setState
  const handleChannelCreated = (channel: Channel) => {
    store.setState(state => {
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

  const handleChannelDeleted = (channelId: string) => {
    store.setState(state => {
      // Handle both optimistic and regular deletions
      const optimisticUpdate = state.optimisticUpdates.get(channelId);
      if (optimisticUpdate) {
        return {
          channels: state.channels.filter(c => c.id !== channelId),
          optimisticUpdates: new Map(
            Array.from(state.optimisticUpdates.entries())
              .filter(([key]) => key !== channelId)
          )
        };
      } else {
        return {
          channels: state.channels.filter(c => c.id !== channelId)
        };
      }
    });

    // If deleted channel was selected, clear selection
    const currentState = store.getState();
    if (currentState.selectedChannelId === channelId) {
      store.setState({ selectedChannelId: null });
    }
  };

  const handleChannelUpdated = (channel: Channel) => {
    store.setState(state => {
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
    store.setState({ error });
  };

  const handleReconnect = () => {
    // Re-fetch channels on reconnect
    fetch('/api/channels')
      .then(res => res.json())
      .then(channels => {
        store.setState({ channels });
      })
      .catch(error => {
        store.setState({ 
          error: error instanceof Error ? error.message : 'Failed to fetch channels' 
        });
      });
  };

  // Set up socket event handlers
  socket.setChannelCreatedHandler(handleChannelCreated);
  socket.setChannelDeletedHandler(handleChannelDeleted);
  socket.setChannelUpdatedHandler(handleChannelUpdated);

  // Return cleanup function
  return () => {
    socket.off('channel-created', handleChannelCreated);
    socket.off('channel-deleted', handleChannelDeleted);
    socket.off('channel-updated', handleChannelUpdated);
  };
}
