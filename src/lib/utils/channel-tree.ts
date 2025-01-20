import type { Channel } from '@/types';

export interface ChannelNode<T = Channel> {
  channel: T;
  threads: ChannelNode<T>[];
}

export function buildChannelTree<T extends Channel>(
  channels: T[],
  options: {
    transformNode?: (node: ChannelNode<T>) => ChannelNode<T>;
  } = {}
): ChannelNode<T>[] {
  const { transformNode = (node) => node } = options;
  const channelMap = new Map<string, ChannelNode<T>>();
  const rootNodes: ChannelNode<T>[] = [];

  // Create nodes for all channels
  channels.forEach(channel => {
    channelMap.set(channel.id, { channel, threads: [] });
  });

  // Build the tree structure
  channels.forEach(channel => {
    const node = channelMap.get(channel.id)!;
    if (channel.parentId) {
      const parentNode = channelMap.get(channel.parentId);
      if (parentNode) {
        parentNode.threads.push(transformNode(node));
      }
    } else {
      rootNodes.push(transformNode(node));
    }
  });

  // Sort each level by name
  const sortNodes = (nodes: ChannelNode<T>[]) => {
    nodes.sort((a, b) => a.channel.name.localeCompare(b.channel.name));
    nodes.forEach(node => sortNodes(node.threads));
  };
  sortNodes(rootNodes);

  return rootNodes;
}

// Helper function to flatten a channel tree into an array
export function flattenChannelTree<T extends Channel>(
  nodes: ChannelNode<T>[]
): T[] {
  return nodes.reduce((acc: T[], node) => {
    return [
      ...acc,
      node.channel,
      ...flattenChannelTree(node.threads)
    ];
  }, []);
}

// Helper to check if a channel is a descendant of another
export function isChannelDescendant(
  channels: Channel[],
  channelId: string,
  ancestorId: string
): boolean {
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return false;
  if (channel.parentId === ancestorId) return true;
  return channel.parentId ? isChannelDescendant(channels, channel.parentId, ancestorId) : false;
} 