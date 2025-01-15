import type { Channel, Message } from '@/types';

export interface OptimisticUpdate {
  type: 'create';
  data: Channel;
  metadata?: {
    parentId?: string;
    messageId?: string;
    initialMessage?: Message;
  };
}

export interface ChannelStore {
  // State
  channels: Channel[];
  selectedChannelId: string | null;
  optimisticUpdates: Map<string, OptimisticUpdate>;
  error: string | null;
  isLoading: boolean;

  // Read operations
  selectChannel: (id: string | null) => void;
  getSelectedChannel: () => Channel | null;
  getChannel: (id: string) => Channel | undefined;
  
  // Tree operations
  getChannelTree: () => Channel[];
  getRootChannels: () => Channel[];
  getThreads: (parentId: string) => Channel[];
  getChannelPath: (channelId: string) => string[];

  // Write operations
  createRootChannel: (name: string) => Promise<Channel>;
  createSubchannel: (name: string, parentId: string) => Promise<Channel>;
  createThread: (name: string, parentId: string, message: Message) => Promise<Channel>;
  deleteChannel: () => Promise<void>;

  // Internal actions
  _setChannels: (channels: Channel[]) => void;
  _addOptimisticChannel: (channel: Channel, metadata?: OptimisticUpdate['metadata']) => void;
  _removeOptimisticChannel: (id: string) => void;
  _replaceOptimisticWithReal: (tempId: string, realChannel: Channel) => void;
  _setError: (error: string | null) => void;
  _setLoading: (isLoading: boolean) => void;
} 