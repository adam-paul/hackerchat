import { create } from 'zustand';
import type { ChannelStore, OptimisticUpdate } from './types';
import type { Channel, Message } from '@/types';
import { useSocket } from '../socket/context';

// Store utilities
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

// Error handling utilities
const handleStoreError = (store: ChannelStore, error: unknown, operation: string) => {
  const errorMessage = error instanceof Error ? error.message : `Failed to ${operation}`;
  store._setError(errorMessage);
  throw error;
};

const withErrorHandling = async <T>(
  store: ChannelStore,
  operation: string,
  action: () => Promise<T>,
  cleanup?: () => void
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    cleanup?.();
    return handleStoreError(store, error, operation);
  }
};

// Memoized selectors
const selectChannels = (state: ChannelStore) => state.channels;
const selectSelectedChannelId = (state: ChannelStore) => state.selectedChannelId;
const selectError = (state: ChannelStore) => state.error;
const selectIsLoading = (state: ChannelStore) => state.isLoading;
const selectOptimisticUpdates = (state: ChannelStore) => state.optimisticUpdates;

const selectSelectedChannel = (state: ChannelStore) => {
  if (!state.selectedChannelId) return null;
  return state.channels.find(c => c.id === state.selectedChannelId) || null;
};

const selectChannelTree = (state: ChannelStore) => buildChannelTree(state.channels);

const selectRootChannels = (state: ChannelStore) => 
  state.channels.filter(c => !c.parentId);

const selectThreads = (state: ChannelStore, parentId: string) => 
  state.channels.filter(c => c.parentId === parentId);

const selectChannelPath = (state: ChannelStore, channelId: string): string[] => {
  const channel = state.channels.find(c => c.id === channelId);
  if (!channel) return [];

  const path = [channel.name];
  let current = channel;

  while (current.parentId) {
    const parent = state.channels.find(c => c.id === current.parentId);
    if (!parent) break;
    path.unshift(parent.name);
    current = parent;
  }

  return path;
};

export const useChannelStore = create<ChannelStore>((set, get) => ({
  // State
  channels: [],
  selectedChannelId: null,
  optimisticUpdates: new Map(),
  error: null,
  isLoading: false,

  // Read operations
  selectChannel: (id: string | null) => {
    const store = get();
    const prevChannel = store.selectedChannelId;
    
    // Don't reselect the same channel
    if (prevChannel === id) return;

    // Update selected channel
    set({ selectedChannelId: id });

    // Clear error state on channel change
    store._setError(null);
  },
  
  getSelectedChannel: () => selectSelectedChannel(get()),
  getChannel: (id: string) => get().channels.find(c => c.id === id),
  getChannelTree: () => selectChannelTree(get()),
  getRootChannels: () => selectRootChannels(get()),
  getThreads: (parentId: string) => selectThreads(get(), parentId),
  getChannelPath: (channelId: string) => selectChannelPath(get(), channelId),

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
      creatorId: 'optimistic',
    };

    // Add optimistic update
    store._addOptimisticChannel(optimisticChannel);
    
    return withErrorHandling(
      store,
      'create channel',
      async () => {
        const response = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, originalId: tempId }),
        });

        if (!response.ok) {
          throw new Error(await response.text() || 'Failed to create channel');
        }

        const realChannel = await response.json();
        store._replaceOptimisticWithReal(tempId, realChannel);
        store.selectChannel(realChannel.id);
        return realChannel;
      },
      () => store._removeOptimisticChannel(tempId)
    );
  },
  
  createSubchannel: async (name: string, parentId: string) => {
    const store = get();
    const tempId = `temp_${name}`;
    
    // Verify parent exists
    const parent = store.getChannel(parentId);
    if (!parent) {
      throw new Error('Parent channel not found');
    }

    // Create optimistic channel
    const optimisticChannel: Channel = {
      id: tempId,
      name,
      parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: 'optimistic', // Will be replaced by server
    };

    // Add optimistic update
    store._addOptimisticChannel(optimisticChannel, { parentId });
    
    try {
      // Create channel on server
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          parentId,
          originalId: tempId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create subchannel');
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
      store._setError(error instanceof Error ? error.message : 'Failed to create subchannel');
      throw error;
    }
  },
  
  createThread: async (name: string, parentId: string, message: Message) => {
    const store = get();
    const tempId = `temp_${name}`;
    
    // Verify parent exists
    const parent = store.getChannel(parentId);
    if (!parent) {
      throw new Error('Parent channel not found');
    }

    // Create optimistic thread channel
    const optimisticThread: Channel = {
      id: tempId,
      name,
      parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: message.author.id,
    };

    // Create optimistic thread message
    const optimisticThreadMessage: Message = {
      id: `temp_thread_${Date.now()}`,
      content: message.content,
      channelId: tempId,
      createdAt: new Date().toISOString(),
      author: message.author,
      reactions: [],
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileType: message.fileType,
      fileSize: message.fileSize
    };

    // Add optimistic update with thread metadata
    store._addOptimisticChannel(optimisticThread, {
      messageId: message.id,
      initialMessage: optimisticThreadMessage,
      parentId
    });
    
    try {
      // Create thread on server
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          parentId,
          initialMessage: {
            content: message.content,
            authorId: message.author.id,
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            fileType: message.fileType,
            fileSize: message.fileSize,
            originalId: message.id
          },
          messageId: message.id,
          originalId: tempId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create thread');
      }

      // Get real thread from response
      const realThread = await response.json();

      // Replace optimistic with real
      store._replaceOptimisticWithReal(tempId, realThread);
      
      // Select the new thread
      store.selectChannel(realThread.id);

      return realThread;
    } catch (error) {
      // Remove optimistic update on error
      store._removeOptimisticChannel(tempId);
      store._setError(error instanceof Error ? error.message : 'Failed to create thread');
      throw error;
    }
  },
  
  deleteChannel: async (id: string) => {
    const store = get();
    const channel = store.getChannel(id);
    if (!channel) {
      return handleStoreError(store, new Error('Channel not found'), 'delete channel');
    }

    // Helper function to check if a channel is a descendant
    const isDescendant = (channelId: string, ancestorId: string): boolean => {
      const ch = store.getChannel(channelId);
      if (!ch) return false;
      if (ch.parentId === ancestorId) return true;
      return ch.parentId ? isDescendant(ch.parentId, ancestorId) : false;
    };

    // Optimistically remove the channel and its descendants from UI
    set(state => ({
      channels: state.channels.filter(c => 
        c.id !== id && !isDescendant(c.id, id)
      ),
      optimisticUpdates: new Map(state.optimisticUpdates).set(id, {
        type: 'delete',
        data: channel
      })
    }));

    // If deleted channel was selected, clear selection
    if (store.selectedChannelId === id || 
        (store.selectedChannelId && isDescendant(store.selectedChannelId, id))) {
      store.selectChannel(null);
    }

    return withErrorHandling(
      store,
      'delete channel',
      async () => {
        const response = await fetch(`/api/channels/${id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          throw new Error(await response.text() || 'Failed to delete channel');
        }

        // Remove from optimistic updates after successful deletion
        store._removeOptimisticChannel(id);
      },
      () => {
        // On error, restore the channel and its descendants
        set(state => ({
          channels: [...state.channels, channel],
          optimisticUpdates: new Map(
            Array.from(state.optimisticUpdates.entries())
              .filter(([key]) => key !== id)
          )
        }));
      }
    );
  },

  // Write operations
  updateChannel: async (id: string, updates: Partial<Channel>) => {
    const store = get();
    const channel = store.getChannel(id);
    if (!channel) {
      return handleStoreError(store, new Error('Channel not found'), 'update channel');
    }

    const optimisticChannel = {
      ...channel,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    store._addOptimisticUpdate(optimisticChannel);
    
    return withErrorHandling(
      store,
      'update channel',
      async () => {
        const response = await fetch(`/api/channels/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error(await response.text() || 'Failed to update channel');
        }

        const updatedChannel = await response.json();
        store._replaceOptimisticWithReal(id, updatedChannel);
        return updatedChannel;
      },
      () => store._removeOptimisticChannel(id)
    );
  },

  // Internal actions
  _setChannels: (channels: Channel[]) => set({ channels }),
  
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
  
  _setLoading: (isLoading: boolean) => set({ isLoading }),

  // Socket sync operations
  handleChannelCreated: (channel: Channel) => {
    const store = get();
    const optimisticUpdate = store.optimisticUpdates.get(channel.originalId || '');
    
    if (optimisticUpdate) {
      // Replace optimistic update with real channel
      store._replaceOptimisticWithReal(optimisticUpdate.data.id, channel);
    } else {
      // Add new channel from socket
      set(state => ({
        channels: [...state.channels, channel].sort((a, b) => a.name.localeCompare(b.name))
      }));
    }
  },

  handleChannelUpdated: (channel: Channel) => {
    set(state => ({
      channels: state.channels.map(c => 
        c.id === channel.id ? channel : c
      )
    }));
  },

  handleChannelDeleted: (channelId: string) => {
    const store = get();
    
    // Remove channel and its descendants
    const isDescendant = (id: string, ancestorId: string): boolean => {
      const channel = store.getChannel(id);
      if (!channel) return false;
      if (channel.parentId === ancestorId) return true;
      return channel.parentId ? isDescendant(channel.parentId, ancestorId) : false;
    };

    set(state => ({
      channels: state.channels.filter(c => 
        c.id !== channelId && !isDescendant(c.id, channelId)
      )
    }));

    // If deleted channel was selected, clear selection
    if (store.selectedChannelId === channelId || 
        (store.selectedChannelId && isDescendant(store.selectedChannelId, channelId))) {
      store.selectChannel(null);
    }
  },

  _addOptimisticUpdate: (channel: Channel) => 
    set(state => ({
      channels: state.channels.map(c => c.id === channel.id ? channel : c),
      optimisticUpdates: new Map(state.optimisticUpdates).set(channel.id, {
        type: 'create',
        data: channel
      })
    })),

  createChannel: async (name: string, description?: string) => {
    const store = get();
    const tempId = `temp_${name}`;
    const socket = useSocket();
    
    // Create optimistic channel
    const optimisticChannel: Channel = {
      id: tempId,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: 'optimistic', // Will be replaced by server
    };

    // Add optimistic update
    store._addOptimisticChannel(optimisticChannel);
    
    try {
      // Create channel via socket
      socket.createChannel({
        name,
        description,
        originalId: tempId
      });

      // The real channel will be received through the socket event
      // and handled by the socket integration layer
      return optimisticChannel;
    } catch (error) {
      // Remove optimistic update on error
      store._removeOptimisticChannel(tempId);
      store._setError(error instanceof Error ? error.message : 'Failed to create channel');
      throw error;
    }
  },
})); 