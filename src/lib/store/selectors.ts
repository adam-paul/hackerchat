import type { ChannelStore } from './types';
import type { Channel } from '@/types';

// Basic selectors
export const selectChannels = (state: ChannelStore) => state.channels;
export const selectSelectedChannelId = (state: ChannelStore) => state.selectedChannelId;
export const selectError = (state: ChannelStore) => state.error;
export const selectIsLoading = (state: ChannelStore) => state.isLoading;

// Derived selectors
export const selectSelectedChannel = (state: ChannelStore) => 
  state.channels.find(c => c.id === state.selectedChannelId);

export const selectChannelById = (id: string) => 
  (state: ChannelStore) => state.channels.find(c => c.id === id);

export const selectChannelsByParentId = (parentId: string | null) =>
  (state: ChannelStore) => state.channels.filter(c => c.parentId === parentId);

// Complex selectors
export const selectChannelDepth = (channelId: string) => (state: ChannelStore): number => {
  const channel = state.channels.find(c => c.id === channelId);
  if (!channel) return 0;
  
  let depth = 0;
  let currentChannel = channel;
  
  while (currentChannel.parentId) {
    depth++;
    currentChannel = state.channels.find(c => c.id === currentChannel.parentId)!;
    if (!currentChannel) break;
  }
  
  return depth;
};

export const selectIsChannelOptimistic = (channelId: string) => 
  (state: ChannelStore) => state.optimisticUpdates.has(channelId);

export const selectChannelPath = (channelId: string) => (state: ChannelStore): Channel[] => {
  const path: Channel[] = [];
  let current = state.channels.find(c => c.id === channelId);
  
  while (current) {
    path.unshift(current);
    if (!current.parentId) break;
    current = state.channels.find(c => c.id === current!.parentId);
  }
  
  return path;
}; 