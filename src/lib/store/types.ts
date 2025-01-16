import type { Channel, Message } from '@/types';
import type { SocketService } from '@/lib/socket/service';

export interface OptimisticUpdate {
  type: 'create' | 'update' | 'delete';
  data: Channel;
  metadata?: {
    parentId?: string;
    messageId?: string;
    initialMessage?: Message;
    threadMetadata?: {
      title: string;
      createdAt: string;
    };
  };
}

export interface ChannelStore {
  // State
  channels: Channel[];
  selectedChannelId: string | null;
  optimisticUpdates: Map<string, OptimisticUpdate>;
  error: string | null;
  isLoading: boolean;

  // Socket initialization
  _initSocket: (socket: SocketService) => void;

  // Read operations
  selectChannel: (id: string | null) => void;
  getSelectedChannel: () => Channel | null;
  getChannel: (id: string) => Channel | undefined;
  getChannelTree: () => Channel[];
  getRootChannels: () => Channel[];
  getThreads: (parentId: string) => Channel[];
  getChannelPath: (channelId: string) => string[];

  // Write operations
  createRootChannel: (name: string) => Promise<Channel>;
  createSubchannel: (name: string, parentId: string) => Promise<Channel>;
  createThread: (name: string, parentId: string, message: Message) => Promise<Channel>;
  updateChannel: (id: string, updates: Partial<Channel>) => Promise<Channel>;
  deleteChannel: (id: string) => Promise<void>;

  // Internal actions
  _setChannels: (channels: Channel[]) => void;
  _addOptimisticChannel: (channel: Channel, metadata?: OptimisticUpdate['metadata']) => void;
  _removeOptimisticChannel: (id: string) => void;
  _replaceOptimisticWithReal: (tempId: string, realChannel: Channel) => void;
  _setError: (error: string | null) => void;
  _setLoading: (isLoading: boolean) => void;
  _addOptimisticUpdate: (channel: Channel) => void;

  // Socket sync operations
  handleChannelCreated: (channel: Channel) => void;
  handleChannelUpdated: (channel: Channel) => void;
  handleChannelDeleted: (channelId: string) => void;
} 