import type { Channel, Message } from '@/types';
import type { SocketService } from '@/lib/socket/service';
import type { ChannelNode } from '@/lib/utils/channel-tree';

export interface OptimisticUpdate {
  type: 'create' | 'update' | 'delete';
  data: Channel;
  metadata?: {
    messageId?: string;
    initialMessage?: Message;
    threadMetadata?: {
      title: string;
      createdAt: string;
    };
  };
}

// Channel creation types
export type BaseChannelCreateParams = {
  name: string;
  type?: "DEFAULT" | "DM";
};

export type RootChannelParams = BaseChannelCreateParams & {
  kind: 'root';
};

export type SubchannelParams = BaseChannelCreateParams & {
  kind: 'subchannel';
  parentId: string;
};

export type ThreadParams = BaseChannelCreateParams & {
  kind: 'thread';
  parentId: string;
  message: Message;
};

export type ChannelCreateParams = RootChannelParams | SubchannelParams | ThreadParams;

export interface ChannelStore {
  // State
  channels: Channel[];
  selectedChannelId: string | null;
  optimisticUpdates: Map<string, OptimisticUpdate>;
  error: string | null;
  isLoading: boolean;

  // Socket initialization
  _initSocket: (socketService: SocketService) => void;

  // Read operations
  selectChannel: (id: string | null) => void;
  getSelectedChannel: () => Channel | null;
  getChannel: (id: string) => Channel | undefined;
  getChannelTree: () => ChannelNode<Channel>[];
  getRootChannels: () => Channel[];
  getDMChannels: () => Channel[];
  getThreads: (parentId: string) => Channel[];
  getChannelPath: (channelId: string) => string[];

  // Write operations
  createChannel: (params: ChannelCreateParams) => Promise<Channel>;
  createRootChannel: (name: string) => Promise<Channel>;
  createSubchannel: (name: string, parentId: string) => Promise<Channel>;
  createThread: (name: string, parentId: string, message: Message) => Promise<Channel>;
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