// src/components/ui/ChannelList.tsx
'use client';

import { useState } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Channel } from '@/types';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: string | null;
  onSelectChannel: (channelId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  onChannelDeleted?: (channelId: string) => void;
  className?: string;
}

export function ChannelList({ 
  channels, 
  selectedChannel, 
  onSelectChannel,
  onChannelCreated,
  onChannelDeleted,
  className = '' 
}: ChannelListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;

    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newChannelName.trim(),
        }),
      });

      if (!response.ok) throw new Error('Failed to create channel');
      
      const newChannel = await response.json();
      onChannelCreated(newChannel);
      onSelectChannel(newChannel.id);
      setNewChannelName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Error creating channel:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateChannel();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewChannelName('');
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      // Updated to use the new consolidated endpoint
      const response = await fetch(`/api/channels/${channelId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      onChannelDeleted?.(channelId);
      if (selectedChannel === channelId) {
        const nextChannel = channels.find(c => c.id !== channelId);
        if (nextChannel) {
          onSelectChannel(nextChannel.id);
        } else {
          onSelectChannel('');
        }
      }
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

  return (
    <div className={`${firaCode.className} ${className}`}>
      <div className="flex items-center justify-between mb-2 text-zinc-400 text-sm">
        <span>channels</span>
        <button 
          onClick={() => setIsCreating(true)}
          className="hover:text-zinc-200 transition-colors"
          aria-label="Create new channel"
        >
          +
        </button>
      </div>
      
      <div className="border-b border-zinc-700 mb-2" />
      
      <div className="space-y-1 text-sm">
        {isCreating && (
          <div className="flex items-center pl-2 text-zinc-400">
            <span className="mr-2">├──</span>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="channel-name"
              className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200"
              autoFocus
            />
            <button
              onClick={() => {
                setIsCreating(false);
                setNewChannelName('');
              }}
              className="ml-2 hover:text-zinc-200"
            >
              x
            </button>
          </div>
        )}
        
        {channels.map((channel, index) => (
          <div 
            key={channel.id}
            className="group flex items-center pl-2 text-zinc-400 relative"
          >
            <span className="mr-2">
              {index === channels.length - 1 ? '└──' : '├──'}
            </span>
            <button
              onClick={() => onSelectChannel(channel.id)}
              className={`hover:text-zinc-200 transition-colors ${
                selectedChannel === channel.id ? 'text-zinc-200' : ''
              }`}
            >
              {channel.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChannel(channel.id);
              }}
              className="opacity-0 group-hover:opacity-100 ml-2 hover:text-zinc-200 transition-opacity absolute right-2 text-base"
              aria-label="Delete channel"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
