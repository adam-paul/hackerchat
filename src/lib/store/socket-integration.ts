'use client';

import type { Channel } from '@/types';
import type { SocketService } from '@/lib/socket/service';
import { useChannelStore } from './channel';

export function setupSocketIntegration(socket: SocketService) {
  // Instead of accessing store directly, use setState
  const store = useChannelStore;

  // Define event handlers using store.setState
  const handleChannelCreated = (channel: Channel) => {
    store.setState(state => {
      const optimisticUpdate = state.optimisticUpdates.get(channel.id);
      if (optimisticUpdate) {
        // Replace optimistic with real
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
        // Add new channel
        return {
          channels: [...state.channels, channel].sort((a, b) => a.name.localeCompare(b.name))
        };
      }
    });
  };

  const handleChannelDeleted = (channelId: string) => {
    store.setState(state => ({
      channels: state.channels.filter(c => c.id !== channelId),
      optimisticUpdates: new Map(
        Array.from(state.optimisticUpdates.entries())
          .filter(([key]) => key !== channelId)
      )
    }));
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

  // Set up event listeners
  socket.on('channel-created', handleChannelCreated);
  socket.on('channel-deleted', handleChannelDeleted);
  socket.on('channel-updated', handleChannelUpdated);
  socket.on('error', handleError);
  socket.on('socket.reconnect', handleReconnect);

  // Return cleanup function
  return () => {
    socket.off('channel-created', handleChannelCreated);
    socket.off('channel-deleted', handleChannelDeleted);
    socket.off('channel-updated', handleChannelUpdated);
    socket.off('error', handleError);
    socket.off('socket.reconnect', handleReconnect);
  };
} 