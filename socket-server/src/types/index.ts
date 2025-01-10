// socket-server/src/types/index.ts

export interface Reaction {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
}

export interface Message {
  id: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
  reactions: Reaction[];
  replyToId?: string;
  replyTo?: {
    id: string;
    content: string;
    author: {
      id: string;
      name: string | null;
    };
  };
  threadId?: string;
  threadName?: string;
}

export interface MessageEvent {
  type: 'message';
  channelId: string;
  messageId: string;
  message: Message;
}

export interface ChannelEvent {
  channelId: string;
  userId: string;
  timestamp: string;
}

export interface MessageDeliveryEvent {
  messageId: string;
  originalId?: string;
  channelId: string;
  timestamp: string;
  message: Message;
}

export interface MessageReceivedEvent {
  messageId: string;
  userId: string;
  timestamp: string;
}

export interface ErrorEvent {
  error: string;
  code: string;
  channelId?: string;
}

export interface StatusEvent {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  timestamp: string;
}

export interface ReactionEvent {
  type: 'reaction';
  channelId: string;
  messageId: string;
  reaction: Reaction;
}

export interface ServerToClientEvents {
  message: (event: MessageEvent) => void;
  'message-delivered': (event: MessageDeliveryEvent) => void;
  'message-received': (event: MessageReceivedEvent) => void;
  'channel-joined': (event: ChannelEvent) => void;
  'channel-left': (event: ChannelEvent) => void;
  'typing-start': (event: ChannelEvent) => void;
  'typing-stop': (event: ChannelEvent) => void;
  'user-connected': (userId: string) => void;
  'user-disconnected': (userId: string) => void;
  'status-changed': (event: StatusEvent) => void;
  'reaction-added': (event: ReactionEvent) => void;
  'reaction-removed': (event: ReactionEvent) => void;
  error: (event: ErrorEvent) => void;
}

export interface ClientToServerEvents {
  'join-channel': (channelId: string) => void;
  'leave-channel': (channelId: string) => void;
  message: (event: MessageEvent) => void;
  'message-received': (messageId: string) => void;
  'typing-start': (channelId: string) => void;
  'typing-stop': (channelId: string) => void;
  'status-update': (status: 'online' | 'away' | 'busy' | 'offline') => void;
  'add-reaction': (event: ReactionEvent) => void;
  'remove-reaction': (event: ReactionEvent) => void;
}

export interface SocketData {
  userId: string;
  userName?: string;
  imageUrl?: string;
} 