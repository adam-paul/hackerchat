import type { Channel, Message } from '@/types';

export interface OptimisticUpdate {
  type: 'create' | 'delete' | 'update';
  data: Channel;
  metadata?: {
    messageId?: string;      // For threads
    initialMessage?: Message; // For threads
    parentId?: string;       // For subchannels
  };
}

export interface ChannelState {
  channels: Channel[];
  selectedChannelId: string | null;
  optimisticUpdates: Map<string, OptimisticUpdate>;
  error: string | null;
  isLoading: boolean;
}

export interface ChannelActions {
  // Read operations
  selectChannel: (id: string | null) => void;
  getChannel: (id: string) => Channel | undefined;
  getChannelTree: () => Channel[];
  getChannelPath: (channelId: string) => string;
  
  // Write operations
  createRootChannel: (name: string) => Promise<void>;
  createSubchannel: (name: string, parentId: string) => Promise<void>;
  createThread: (name: string, parentId: string, message: Message) => Promise<void>;
  deleteChannel: (id: string) => Promise<void>;
  
  // Internal actions
  _addOptimisticChannel: (channel: Channel, metadata?: OptimisticUpdate['metadata']) => void;
  _removeOptimisticChannel: (id: string) => void;
  _replaceOptimisticWithReal: (tempId: string, realChannel: Channel) => void;
  _setError: (error: string | null) => void;
  _setLoading: (isLoading: boolean) => void;
}

export type ChannelStore = ChannelState & ChannelActions; 