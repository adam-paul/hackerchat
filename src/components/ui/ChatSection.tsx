'use client';

import React, { useMemo } from 'react';
import { Fira_Code } from 'next/font/google';
import { useChannelStore } from '@/lib/store/channel';
import { useAuthContext } from '@/lib/auth/context';
import { useUsers } from '@/lib/users/context';
import { useSocket } from '@/lib/socket/context';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface ChatSectionProps {
  isCollapsed: boolean;
  isSidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function ChatSection({ 
  isCollapsed, 
  isSidebarCollapsed, 
  onToggleCollapse,
  className = '' 
}: ChatSectionProps) {
  const { userId } = useAuthContext();
  const { users } = useUsers();
  const { socket } = useSocket();
  
  // Get raw channels from store without filtering
  const channels = useChannelStore(state => state.channels);
  const selectedChannelId = useChannelStore(state => state.selectedChannelId);
  const selectChannel = useChannelStore(state => state.selectChannel);

  // Memoize DM channel filtering and bot users
  const { dmChannelsWithNames, botUsers } = useMemo(() => {
    // Get DM channels
    const dmChannels = channels.filter(c => c.type === "DM");
    const dmWithNames = dmChannels.map(channel => ({
      ...channel,
      displayName: channel.participants?.find(p => p.id !== userId)?.name || 'Unknown User'
    }));

    // Get bot users that don't have DM channels yet
    const existingDmUserIds = new Set(dmChannels.flatMap(c => 
      c.participants?.map(p => p.id) || []
    ));
    
    const bots = users.filter(user => 
      user.id.startsWith('bot_') && !existingDmUserIds.has(user.id)
    );

    return { 
      dmChannelsWithNames: dmWithNames,
      botUsers: bots
    };
  }, [channels, users, userId]);

  if (isSidebarCollapsed) return null;

  return (
    <div className={`${firaCode.className} ${className} flex flex-col transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 text-zinc-400 text-sm">
        <div className="flex items-center gap-2">
          <span>chat</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <button 
          onClick={onToggleCollapse}
          className="hover:text-zinc-200 transition-colors h-full flex items-center justify-center text-xs"
          aria-label={isCollapsed ? 'Expand chat' : 'Collapse chat'}
        >
          {isCollapsed ? '∧' : '∨'}
        </button>
      </div>

      <div className="border-b border-zinc-700 mb-2" />

      {!isCollapsed && (
        <div className="space-y-1 text-sm overflow-y-auto overflow-x-hidden">
          {/* Bot Users */}
          {botUsers.map(bot => (
            <button
              key={bot.id}
              onClick={() => {
                if (socket) {
                  socket.createDM(bot.id);
                }
              }}
              className="w-full text-left px-2 py-1 hover:text-zinc-200 transition-colors text-zinc-400 flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2" />
                <path d="M8 11.5v1a3.5 3.5 0 0 0 7 0v-1" />
                <path d="M7 10h.01M17 10h.01" />
              </svg>
              {bot.name}
            </button>
          ))}

          {/* Existing DM Channels */}
          {dmChannelsWithNames.map(channel => (
            <button
              key={channel.id}
              onClick={() => selectChannel(channel.id)}
              className={`w-full text-left px-2 py-1 hover:text-zinc-200 transition-colors flex items-center gap-2 ${
                selectedChannelId === channel.id ? 'text-zinc-200' : 'text-zinc-400'
              }`}
            >
              {channel.participants?.some(p => p.id.startsWith('bot_')) && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2" />
                  <path d="M8 11.5v1a3.5 3.5 0 0 0 7 0v-1" />
                  <path d="M7 10h.01M17 10h.01" />
                </svg>
              )}
              {channel.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
} 