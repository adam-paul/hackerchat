import { create } from 'zustand';
import type { ChannelStore, OptimisticUpdate } from './types';
import type { Channel, Message } from '@/types';
import type { SocketService } from '@/lib/socket/service';

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

export const useChannelStore = create<ChannelStore>((set, get) => {
  // Initialize socket as null - will be set later
  let socket: SocketService | null = null;

  return {
    // State
    channels: [],
    selectedChannelId: null,
    optimisticUpdates: new Map(),
    error: null,
    isLoading: false,

    // Socket initialization
    _initSocket: (socketService: SocketService) => {
      socket = socketService;
    },

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

    // Write operations
    createRootChannel: async (name: string) => {
      if (!socket) throw new Error('Socket not initialized');
      const store = get();
      const tempId = `temp_${name}`;
      
      // Create optimistic channel
      const optimisticChannel: Channel = {
        id: tempId,
        name,
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creatorId: socket.getCurrentUserId() || 'optimistic',
        originalId: tempId // Add this to track the optimistic update
      };

      // Add optimistic update
      store._addOptimisticChannel(optimisticChannel);
      
      try {
        await socket.createChannel(name, undefined, undefined, {
          onError: (error) => {
            store._removeOptimisticChannel(tempId);
            store._setError(error);
          },
          onCreated: (channel) => {
            // Replace optimistic update with real channel
            store._replaceOptimisticWithReal(tempId, {
              ...channel,
              originalId: tempId // Preserve the originalId for matching
            });
          }
        });
        return optimisticChannel;
      } catch (error) {
        store._removeOptimisticChannel(tempId);
        store._setError(error instanceof Error ? error.message : 'Failed to create channel');
        throw error;
      }
    },
    
    createSubchannel: async (name: string, parentId: string) => {
      if (!socket) throw new Error('Socket not initialized');
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
        creatorId: 'optimistic',
      };

      // Add optimistic update
      store._addOptimisticChannel(optimisticChannel, { parentId });
      
      try {
        await socket.createChannel(name, parentId, undefined, {
          onError: (error) => {
            store._removeOptimisticChannel(tempId);
            store._setError(error);
          }
        });
        return optimisticChannel;
      } catch (error) {
        store._removeOptimisticChannel(tempId);
        store._setError(error instanceof Error ? error.message : 'Failed to create subchannel');
        throw error;
      }
    },

    createThread: async (name: string, parentId: string, message: Message) => {
      if (!socket) throw new Error('Socket not initialized');
      const store = get();
      const tempId = `temp_${name}`;
      
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
    
      // Add optimistic update for thread channel
      store._addOptimisticChannel(optimisticThread, {
        messageId: message.id,
        initialMessage: optimisticThreadMessage,
        threadMetadata: {
          title: name,
          createdAt: new Date().toISOString()
        }
      });

      try {
        // Send creation request and wait for broadcast
        await socket.createChannel(name, parentId, message.content, {
          onError: (error) => {
            store._removeOptimisticChannel(tempId);
            store._setError(error);
          },
          metadata: {
            messageId: message.id,
            initialMessage: optimisticThreadMessage,
            threadMetadata: {
              title: name,
              createdAt: new Date().toISOString()
            }
          }
        });
    
        return optimisticThread;
      } catch (error) {
        store._removeOptimisticChannel(tempId);
        store._setError(error instanceof Error ? error.message : 'Failed to create thread');
        throw error;
      }
    },

    updateChannel: async (id: string, updates: Partial<Channel>) => {
      if (!socket) throw new Error('Socket not initialized');
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
      
      try {
        await socket.updateChannel(id, {
          name: updates.name,
          description: updates.description || undefined
        }, {
          onError: (error) => {
            store._removeOptimisticChannel(id);
            store._setError(error);
          }
        });
        return optimisticChannel;
      } catch (error) {
        store._removeOptimisticChannel(id);
        store._setError(error instanceof Error ? error.message : 'Failed to update channel');
        throw error;
      }
    },

    deleteChannel: async (id: string) => {
      if (!socket) throw new Error('Socket not initialized');
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

      // Get all affected channels before removal
      const affectedChannels = store.channels.filter((c: Channel) => 
        c.id === id || isDescendant(c.id, id)
      );

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

      try {
        await socket.deleteChannel(id, {
          onError: (error) => {
            // Restore all affected channels on error
            set(state => ({
              channels: [...state.channels, ...affectedChannels],
              optimisticUpdates: new Map(
                Array.from(state.optimisticUpdates.entries())
                  .filter(([key]) => key !== id)
              )
            }));
            store._setError(error);
          }
        });
      } catch (error) {
        // Restore all affected channels on error
        set(state => ({
          channels: [...state.channels, ...affectedChannels],
          optimisticUpdates: new Map(
            Array.from(state.optimisticUpdates.entries())
              .filter(([key]) => key !== id)
          )
        }));
        store._setError(error instanceof Error ? error.message : 'Failed to delete channel');
        throw error;
      }
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
  };
}); 