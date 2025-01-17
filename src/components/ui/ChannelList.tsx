// src/components/ui/ChannelList.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Channel } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useChannelStore } from '@/lib/store/channel';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface ChannelListProps {
  className?: string;
}

interface ChannelNode {
  channel: Channel;
  threads: ChannelNode[];
}

function buildChannelTree(channels: Channel[]): ChannelNode[] {
  const channelMap = new Map<string, ChannelNode>();
  const rootNodes: ChannelNode[] = [];

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
        parentNode.threads.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  });

  // Sort each level by name
  const sortNodes = (nodes: ChannelNode[]) => {
    nodes.sort((a, b) => a.channel.name.localeCompare(b.channel.name));
    nodes.forEach(node => sortNodes(node.threads));
  };
  sortNodes(rootNodes);

  return rootNodes;
}

export function ChannelList({ className = '' }: ChannelListProps) {
  const { userId } = useAuthContext();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);

  // Add Zustand store hooks with selector
  const channels = useChannelStore(state => state.channels);
  const selectedChannelId = useChannelStore(state => state.selectedChannelId);
  const selectChannel = useChannelStore(state => state.selectChannel);
  const createRootChannel = useChannelStore(state => state.createRootChannel);
  const createSubchannel = useChannelStore(state => state.createSubchannel);
  const deleteChannel = useChannelStore(state => state.deleteChannel);

  // Memoize channel tree
  const channelTree = useMemo(() => buildChannelTree(channels.filter(c => c.type === "DEFAULT")), [channels]);

  // Memoize handlers
  const handleCreateChannel = useCallback(async () => {
    if (isSubmitting || !newChannelName.trim()) return;
    
    setIsSubmitting(true);
    const channelName = newChannelName.trim();
    
    // Clear UI immediately
    setNewChannelName('');
    setIsCreating(false);
    setParentId(null);

    try {
      if (!parentId) {
        await createRootChannel(channelName);
      } else {
        await createSubchannel(channelName, parentId);
      }
    } catch (error) {
      console.error('Error creating channel:', error);
      setNewChannelName(channelName);
      setIsCreating(true);
      if (parentId) {
        setParentId(parentId);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, newChannelName, parentId, createRootChannel, createSubchannel]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateChannel();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewChannelName('');
      setParentId(null);
    }
  }, [handleCreateChannel]);

  const handleDeleteChannel = useCallback(async (channelId: string) => {
    try {
      await deleteChannel(channelId);
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  }, [deleteChannel]);

  // Memoize renderChannelNode to prevent unnecessary re-renders
  const renderChannelNode = useCallback((node: ChannelNode, depth: number = 0, isLast: boolean = true) => {
    const { channel, threads } = node;
    const hasThreads = threads.length > 0;
    const prefix = depth === 0 ? '' : '  '.repeat(depth);
    const branchSymbol = isLast ? '└──' : '├──';
    const isCreatingThread = isCreating && parentId === channel.id;
    const canDelete = channel.creatorId === userId;

    return (
      <div key={channel.id}>
        <div 
          className="group flex items-center text-zinc-400 relative"
          onMouseEnter={() => setHoveredChannel(channel.id)}
          onMouseLeave={() => setHoveredChannel(null)}
        >
          <span className="mr-2 whitespace-pre">
            {prefix}{branchSymbol}
          </span>
          <button
            onClick={() => selectChannel(channel.id)}
            className={`hover:text-zinc-200 transition-colors ${
              selectedChannelId === channel.id ? 'text-zinc-200' : ''
            }`}
          >
            {channel.name}
          </button>
          {hoveredChannel === channel.id && (
            <>
              {depth < 2 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setParentId(channel.id);
                    setIsCreating(true);
                  }}
                  className="ml-2 opacity-0 group-hover:opacity-100 hover:text-zinc-200 transition-opacity"
                  aria-label="Create thread"
                >
                  +
                </button>
              )}
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChannel(channel.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 ml-2 hover:text-zinc-200 transition-opacity absolute right-2"
                  aria-label="Delete channel"
                >
                  ×
                </button>
              )}
            </>
          )}
        </div>
        {isCreatingThread && (
          <div className="flex items-center text-zinc-400 relative">
            <span className="mr-2 whitespace-pre">
              {prefix}  └──
            </span>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="thread-name"
              className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200 placeholder:text-zinc-500/50"
              autoFocus
            />
            <button
              onClick={() => {
                setIsCreating(false);
                setNewChannelName('');
                setParentId(null);
              }}
              className="hover:text-zinc-200 transition-opacity absolute right-2"
            >
              ×
            </button>
          </div>
        )}
        {hasThreads && threads.map((thread, index) => 
          renderChannelNode(thread, depth + 1, index === threads.length - 1)
        )}
      </div>
    );
  }, [isCreating, parentId, hoveredChannel, selectedChannelId, userId, selectChannel, handleDeleteChannel, newChannelName, handleKeyPress]);

  return (
    <div className={`${firaCode.className} ${className}`}>
      <div className="flex items-center justify-between mb-2 text-zinc-400 text-sm">
        <span>channels</span>
        <button 
          onClick={() => {
            setParentId(null);
            setIsCreating(true);
          }}
          className="hover:text-zinc-200 transition-colors"
          aria-label="Create new channel"
        >
          +
        </button>
      </div>
      
      <div className="border-b border-zinc-700 mb-2" />
      
      <div className="space-y-1 text-sm">
        {isCreating && !parentId && (
          <div className="flex items-center pl-2 text-zinc-400 relative">
            <span className="mr-2 whitespace-pre">└──</span>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="channel-name"
              className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200 placeholder:text-zinc-500/50"
              autoFocus
            />
            <button
              onClick={() => {
                setIsCreating(false);
                setNewChannelName('');
                setParentId(null);
              }}
              className="hover:text-zinc-200 transition-opacity absolute right-2"
            >
              ×
            </button>
          </div>
        )}
        {channelTree.map((node, index) => 
          renderChannelNode(node, 0, index === channelTree.length - 1)
        )}
      </div>
    </div>
  );
}
