import { create } from 'zustand';
import type { ChannelStore, OptimisticUpdate } from './types';
import type { Channel, Message } from '@/types';
import type { SocketService } from '@/lib/socket/service';
import { buildChannelTree, isChannelDescendant } from '@/lib/utils/channel-tree';

// Store utilities
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
  state.channels.filter(c => !c.parentId && c.type === "DEFAULT");

const selectDMChannels = (state: ChannelStore) =>
  state.channels.filter(c => c.type === "DM");

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

// Add new type definitions
type BaseChannelCreateParams = {
  name: string;
  type?: "DEFAULT" | "DM";
};

type RootChannelParams = BaseChannelCreateParams & {
  kind: 'root';
};

type SubchannelParams = BaseChannelCreateParams & {
  kind: 'subchannel';
  parentId: string;
};

type ThreadParams = BaseChannelCreateParams & {
  kind: 'thread';
  parentId: string;
  message: Message;
};

type ChannelCreateParams = RootChannelParams | SubchannelParams | ThreadParams;

export const useChannelStore = create<ChannelStore>((set, get) => {
  // Initialize socket as null - will be set later
  let socket: SocketService | null = null;

  // Helper function to create optimistic channel
  const createOptimisticChannel = (
    name: string,
    params: ChannelCreateParams
  ): Channel => {
    const tempId = `temp_${name}`;
    return {
      id: tempId,
      name,
      type: params.type || "DEFAULT",
      parentId: 'parentId' in params ? params.parentId : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: socket?.getCurrentUserId() || 'optimistic',
      originalId: tempId
    };
  };

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
    getDMChannels: () => selectDMChannels(get()),
    getThreads: (parentId: string) => selectThreads(get(), parentId),
    getChannelPath: (channelId: string) => selectChannelPath(get(), channelId),

    // Write operations
    createChannel: async (params: ChannelCreateParams): Promise<Channel> => {
      if (!socket) throw new Error('Socket not initialized');
      const store = get();
      
      // Validate parent if needed
      if ('parentId' in params) {
        const parent = store.getChannel(params.parentId);
        if (!parent) {
          throw new Error('Parent channel not found');
        }
      }

      const optimisticChannel = createOptimisticChannel(params.name, params);

      // Handle thread-specific metadata
      const metadata = params.kind === 'thread' ? {
        messageId: params.message.id,
        initialMessage: {
          id: `temp_thread_${Date.now()}`,
          content: params.message.content,
          channelId: optimisticChannel.id,
          createdAt: new Date().toISOString(),
          author: params.message.author,
          reactions: [],
          fileUrl: params.message.fileUrl,
          fileName: params.message.fileName,
          fileType: params.message.fileType,
          fileSize: params.message.fileSize
        },
        threadMetadata: {
          title: params.name,
          createdAt: new Date().toISOString()
        }
      } : undefined;

      // Add optimistic update and select it
      store._addOptimisticChannel(optimisticChannel, metadata);
      store.selectChannel(optimisticChannel.id);

      try {
        await socket.createChannel(
          params.name,
          'parentId' in params ? params.parentId : undefined,
          params.kind === 'thread' ? params.message.content : undefined,
          {
            onError: (error) => {
              store._removeOptimisticChannel(optimisticChannel.id);
              store._setError(error);
            },
            onCreated: (channel) => {
              // Replace optimistic update with real channel
              store._replaceOptimisticWithReal(optimisticChannel.id, {
                ...channel,
                originalId: optimisticChannel.id
              });
              store.selectChannel(channel.id);

              // Handle thread-specific message updates
              if (params.kind === 'thread' && socket) {
                socket.updateMessage(params.message.id, {
                  threadId: channel.id,
                  threadMetadata: {
                    title: params.name,
                    createdAt: channel.createdAt
                  }
                });
              }
            },
            metadata
          }
        );
        return optimisticChannel;
      } catch (error) {
        store._removeOptimisticChannel(optimisticChannel.id);
        store._setError(error instanceof Error ? error.message : `Failed to create ${params.kind}`);
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

      // Get all affected channels before removal
      const affectedChannels = store.channels.filter((c: Channel) => 
        c.id === id || isChannelDescendant(store.channels, c.id, id)
      );

      // Optimistically remove the channel and its descendants from UI
      set(state => ({
        channels: state.channels.filter(c => 
          c.id !== id && !isChannelDescendant(state.channels, c.id, id)
        ),
        optimisticUpdates: new Map(state.optimisticUpdates).set(id, {
          type: 'delete',
          data: channel
        })
      }));

      // If deleted channel was selected, clear selection
      if (store.selectedChannelId === id || 
          (store.selectedChannelId && isChannelDescendant(store.channels, store.selectedChannelId, id))) {
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
      set(state => ({
        channels: state.channels.filter(c => 
          c.id !== channelId && !isChannelDescendant(state.channels, c.id, channelId)
        )
      }));

      // If deleted channel was selected, clear selection
      if (store.selectedChannelId === channelId || 
          (store.selectedChannelId && isChannelDescendant(store.channels, store.selectedChannelId, channelId))) {
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

    // Simplified wrapper methods for backward compatibility
    createRootChannel: async (name: string) => {
      const store = get();
      return store.createChannel({ kind: 'root', name });
    },

    createSubchannel: async (name: string, parentId: string) => {
      const store = get();
      return store.createChannel({ kind: 'subchannel', name, parentId });
    },

    createThread: async (name: string, parentId: string, message: Message) => {
      const store = get();
      return store.createChannel({ kind: 'thread', name, parentId, message });
    },
  };
}); 