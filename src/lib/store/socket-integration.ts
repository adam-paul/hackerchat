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
    if (!channel || !channel.id) {
      console.error('Received invalid channel data:', channel);
      return;
    }

    store.setState(state => {
      const optimisticUpdate = channel.originalId ? state.optimisticUpdates.get(channel.originalId) : null;
      
      if (optimisticUpdate) {
        // Replace optimistic with real
        return {
          channels: state.channels.map(c => 
            c.id === optimisticUpdate.data.id ? channel : c
          ),
          optimisticUpdates: new Map(
            Array.from(state.optimisticUpdates.entries())
              .filter(([key]) => key !== channel.originalId)
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
    if (!channelId) {
      console.error('Received invalid channelId:', channelId);
      return;
    }

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
    if (!channel || !channel.id) {
      console.error('Received invalid channel data:', channel);
      return;
    }

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
    if (!error) return;
    store.setState({ error });
  };

  const handleReconnect = () => {
    // Re-fetch channels on reconnect
    fetch('/api/channels')
      .then(res => res.json())
      .then(channels => {
        if (Array.isArray(channels)) {
          store.setState({ channels });
        }
      })
      .catch(error => {
        console.error('Failed to fetch channels on reconnect:', error);
        store.setState({ error: 'Failed to reconnect and fetch channels' });
      });
  };

  // Set up socket event listeners
  socket.on('channel:created', handleChannelCreated);
  socket.on('channel:updated', handleChannelUpdated);
  socket.on('channel:deleted', handleChannelDeleted);
  socket.on('error', handleError);
  socket.on('reconnect', handleReconnect);

  // Return cleanup function
  return () => {
    socket.off('channel:created', handleChannelCreated);
    socket.off('channel:updated', handleChannelUpdated);
    socket.off('channel:deleted', handleChannelDeleted);
    socket.off('error', handleError);
    socket.off('reconnect', handleReconnect);
  };
}
