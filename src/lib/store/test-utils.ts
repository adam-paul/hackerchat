import type { Channel, Message } from '@/types';

export const createMockChannel = (
  overrides: Partial<Channel> = {}
): Channel => ({
  id: `channel_${Date.now()}`,
  name: 'test-channel',
  type: "DEFAULT",
  description: null,
  parentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  creatorId: 'test-user',
  _count: { messages: 0 },
  ...overrides
});

export const createMockMessage = (
  overrides: Partial<Message> = {}
): Message => ({
  id: `message_${Date.now()}`,
  content: 'test message',
  channelId: 'test-channel',
  createdAt: new Date().toISOString(),
  author: {
    id: 'test-user',
    name: 'Test User',
    imageUrl: undefined
  },
  reactions: [],
  ...overrides
});

export const createMockChannelTree = (depth: number = 2, breadth: number = 2): Channel[] => {
  const channels: Channel[] = [];
  
  // Create root channels
  for (let i = 0; i < breadth; i++) {
    const rootChannel = createMockChannel({
      id: `root_${i}`,
      name: `Root Channel ${i}`
    });
    channels.push(rootChannel);
    
    if (depth > 1) {
      // Create subchannels
      for (let j = 0; j < breadth; j++) {
        const subChannel = createMockChannel({
          id: `sub_${i}_${j}`,
          name: `Sub Channel ${i}.${j}`,
          parentId: rootChannel.id
        });
        channels.push(subChannel);
        
        if (depth > 2) {
          // Create threads
          for (let k = 0; k < breadth; k++) {
            channels.push(createMockChannel({
              id: `thread_${i}_${j}_${k}`,
              name: `Thread ${i}.${j}.${k}`,
              parentId: subChannel.id
            }));
          }
        }
      }
    }
  }
  
  return channels;
}; 