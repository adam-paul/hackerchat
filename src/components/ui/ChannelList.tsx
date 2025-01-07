'use client';

import { useState } from 'react';
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface Channel {
  id: string;
  name: string;
  description?: string;
  _count: { messages: number };
}

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: string | null;
  onSelectChannel: (channelId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  className?: string;
}

export function ChannelList({ 
  channels, 
  selectedChannel, 
  onSelectChannel,
  onChannelCreated,
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
      onChannelCreated(newChannel);    // Update parent's channel list
      onSelectChannel(newChannel.id);  // Auto-select the new channel
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
              ×
            </button>
          </div>
        )}
        
        {channels.map((channel, index) => (
          <div 
            key={channel.id}
            className="flex items-center pl-2 text-zinc-400"
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
          </div>
        ))}
      </div>
    </div>
  );
}
