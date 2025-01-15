'use client';

import type { Channel, Message } from '@/types';
import type { SocketService } from '@/lib/socket/service';
import { useChannelStore } from './channel';

export function setupSocketIntegration(socket: SocketService) {
  // Get store actions
  const store = useChannelStore.getState();
  const { 
    _addOptimisticChannel, 
    _removeOptimisticChannel, 
    _replaceOptimisticWithReal,
    _setError
  } = store;

  // Define event handlers
  const handleChannelCreated = (channel: Channel) => {
    // Check if we have an optimistic update for this channel
    const optimisticUpdate = store.optimisticUpdates.get(channel.id);
    if (optimisticUpdate) {
      // Replace optimistic with real
      _replaceOptimisticWithReal(channel.id, channel);
    } else {
      // Add new channel
      _addOptimisticChannel(channel);
    }
  };

  const handleChannelDeleted = (channelId: string) => {
    _removeOptimisticChannel(channelId);
  };

  const handleChannelUpdated = (channel: Channel) => {
    const optimisticUpdate = store.optimisticUpdates.get(channel.id);
    if (optimisticUpdate) {
      // Replace optimistic with real
      _replaceOptimisticWithReal(channel.id, channel);
    } else {
      // Update existing channel
      const channels = store.channels.map(c => 
        c.id === channel.id ? channel : c
      );
      useChannelStore.setState({ channels });
    }
  };

  const handleError = (error: string) => {
    _setError(error);
  };

  const handleReconnect = () => {
    // Re-fetch channels on reconnect
    fetch('/api/channels')
      .then(res => res.json())
      .then(channels => {
        useChannelStore.setState({ channels });
      })
      .catch(error => {
        _setError(error instanceof Error ? error.message : 'Failed to fetch channels');
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
    // Cleanup socket listeners
    socket.off('channel-created', handleChannelCreated);
    socket.off('channel-deleted', handleChannelDeleted);
    socket.off('channel-updated', handleChannelUpdated);
    socket.off('error', handleError);
    socket.off('socket.reconnect', handleReconnect);
  };
} 