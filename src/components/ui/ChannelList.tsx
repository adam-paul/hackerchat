// src/components/ui/ChannelList.tsx
'use client';

import { useState, useEffect, useMemo, memo } from 'react';
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

// Move ChannelNode rendering to a separate memoized component
const ChannelNodeComponent = memo(function ChannelNodeComponent({
  node,
  depth = 0,
  isLast = true,
  userId,
  selectedChannelId,
  hoveredChannel,
  isCreating,
  parentId,
  newChannelName,
  onSelect,
  onDelete,
  onCreateThread,
  onCancelCreate,
  onNameChange,
  onKeyPress
}: {
  node: ChannelNode;
  depth?: number;
  isLast?: boolean;
  userId: string;
  selectedChannelId: string | null;
  hoveredChannel: string | null;
  isCreating: boolean;
  parentId: string | null;
  newChannelName: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateThread: (id: string) => void;
  onCancelCreate: () => void;
  onNameChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}) {
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
        onMouseEnter={() => onCreateThread(channel.id)}
        onMouseLeave={() => onCreateThread('')}
      >
        <span className="mr-2 whitespace-pre">
          {prefix}{branchSymbol}
        </span>
        <button
          onClick={() => onSelect(channel.id)}
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
                  onCreateThread(channel.id);
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
                  onDelete(channel.id);
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
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={onKeyPress}
            placeholder="thread-name"
            className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200 placeholder:text-zinc-500/50"
            autoFocus
          />
          <button
            onClick={onCancelCreate}
            className="hover:text-zinc-200 transition-opacity absolute right-2"
          >
            ×
          </button>
        </div>
      )}
      {hasThreads && threads.map((thread, index) => (
        <ChannelNodeComponent
          key={thread.channel.id}
          node={thread}
          depth={depth + 1}
          isLast={index === threads.length - 1}
          userId={userId}
          selectedChannelId={selectedChannelId}
          hoveredChannel={hoveredChannel}
          isCreating={isCreating}
          parentId={parentId}
          newChannelName={newChannelName}
          onSelect={onSelect}
          onDelete={onDelete}
          onCreateThread={onCreateThread}
          onCancelCreate={onCancelCreate}
          onNameChange={onNameChange}
          onKeyPress={onKeyPress}
        />
      ))}
    </div>
  );
});

export const ChannelList = memo(function ChannelList({ className = '' }: ChannelListProps) {
  const { userId } = useAuthContext();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);

  // Return early if no userId
  if (!userId) return null;

  const { 
    channels,
    selectedChannelId,
    selectChannel,
    createRootChannel,
    createSubchannel,
    deleteChannel
  } = useChannelStore();

  // Memoize channel tree construction
  const channelTree = useMemo(() => buildChannelTree(channels), [channels]);

  const handleCreateChannel = async () => {
    if (isSubmitting || !newChannelName.trim()) return;
    
    setIsSubmitting(true);
    const channelName = newChannelName.trim();
    
    // Clear UI immediately
    setNewChannelName('');
    setIsCreating(false);
    setParentId(null);

    try {
      if (!parentId) {
        // Create root channel using store method
        await createRootChannel(channelName);
      } else {
        // Create subchannel using store method
        await createSubchannel(channelName, parentId);
      }
    } catch (error) {
      console.error('Error creating channel:', error);
      // Restore UI state for retry
      setNewChannelName(channelName);
      setIsCreating(true);
      if (parentId) {
        setParentId(parentId);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateChannel();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewChannelName('');
      setParentId(null);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await deleteChannel(channelId);
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

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
        {channelTree.map((node, index) => (
          <ChannelNodeComponent
            key={node.channel.id}
            node={node}
            depth={0}
            isLast={index === channelTree.length - 1}
            userId={userId}
            selectedChannelId={selectedChannelId}
            hoveredChannel={hoveredChannel}
            isCreating={isCreating}
            parentId={parentId}
            newChannelName={newChannelName}
            onSelect={selectChannel}
            onDelete={handleDeleteChannel}
            onCreateThread={setHoveredChannel}
            onCancelCreate={() => {
              setIsCreating(false);
              setNewChannelName('');
              setParentId(null);
            }}
            onNameChange={setNewChannelName}
            onKeyPress={handleKeyPress}
          />
        ))}
      </div>
    </div>
  );
});
