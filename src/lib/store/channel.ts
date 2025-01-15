import { create } from 'zustand';
import type { ChannelStore, OptimisticUpdate } from './types';
import type { Channel } from '@/types';

// Helper function to build channel tree
const buildChannelTree = (channels: Channel[]): Channel[] => {
  const channelMap = new Map<string, Channel & { threads: Channel[] }>();
  const rootNodes: Channel[] = [];

  // Create nodes for all channels
  channels.forEach(channel => {
    channelMap.set(channel.id, { ...channel, threads: [] });
  });

  // Build the tree structure
  channels.forEach(channel => {
    const node = channelMap.get(channel.id)!;
    if (channel.parentId) {
      const parentNode = channelMap.get(channel.parentId);
      if (parentNode) {
        parentNode.threads.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  });

  // Sort each level by name
  const sortNodes = (nodes: Channel[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(node => {
      if ('threads' in node) {
        sortNodes((node as any).threads);
      }
    });
  };
  sortNodes(rootNodes);

  return rootNodes;
};

export const useChannelStore = create<ChannelStore>((set, get) => ({
  // State
  channels: [],
  selectedChannelId: null,
  optimisticUpdates: new Map(),
  error: null,
  isLoading: false,

  // Read operations
  selectChannel: (id: string | null) => set({ selectedChannelId: id }),
  
  getChannel: (id: string) => get().channels.find(c => c.id === id),
  
  getChannelTree: () => buildChannelTree(get().channels),

  // Write operations (stubs for now)
  createRootChannel: async (name: string) => {
    const store = get();
    const tempId = `temp_${name}`;
    
    // Create optimistic channel
    const optimisticChannel: Channel = {
      id: tempId,
      name,
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: 'optimistic', // Will be replaced by server
    };

    // Add optimistic update
    store._addOptimisticChannel(optimisticChannel);
    
    try {
      // Create channel on server
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          originalId: tempId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create channel');
      }

      // Get real channel from response
      const realChannel = await response.json();

      // Replace optimistic with real
      store._replaceOptimisticWithReal(tempId, realChannel);
      
      // Select the new channel
      store.selectChannel(realChannel.id);

      return realChannel;
    } catch (error) {
      // Remove optimistic update on error
      store._removeOptimisticChannel(tempId);
      store._setError(error instanceof Error ? error.message : 'Failed to create channel');
      throw error;
    }
  },
  
  createSubchannel: async () => {
    throw new Error('Not implemented');
  },
  
  createThread: async () => {
    throw new Error('Not implemented');
  },
  
  deleteChannel: async () => {
    throw new Error('Not implemented');
  },

  // Internal actions
  _addOptimisticChannel: (channel: Channel, metadata?: OptimisticUpdate['metadata']) => 
    set(state => ({
      channels: [...state.channels, channel],
      optimisticUpdates: new Map(state.optimisticUpdates).set(channel.id, {
        type: 'create',
        data: channel,
        metadata
      })
    })),

  _removeOptimisticChannel: (id: string) =>
    set(state => ({
      channels: state.channels.filter(c => c.id !== id),
      optimisticUpdates: new Map(
        Array.from(state.optimisticUpdates.entries())
          .filter(([key]) => key !== id)
      )
    })),

  _replaceOptimisticWithReal: (tempId: string, realChannel: Channel) =>
    set(state => ({
      channels: state.channels.map(c =>
        c.id === tempId ? realChannel : c
      ),
      optimisticUpdates: new Map(
        Array.from(state.optimisticUpdates.entries())
          .filter(([key]) => key !== tempId)
      )
    })),

  _setError: (error: string | null) => set({ error }),
  
  _setLoading: (isLoading: boolean) => set({ isLoading })
})); 