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

  // Memoize DM channels and available bot users
  const { dmChannels, availableBots } = useMemo(() => {
    // Get DM channels
    const dmChannels = channels.filter(c => c.type === "DM").map(channel => {
      const otherParticipant = channel.participants?.find(p => p.id !== userId);
      return {
        ...channel,
        displayName: otherParticipant?.name || 'Unknown User',
        isBot: otherParticipant?.id.startsWith('bot_')
      };
    });

    // Get bot users that don't have DM channels yet
    const existingDmUserIds = new Set(dmChannels.flatMap(c => 
      c.participants?.map(p => p.id) || []
    ));
    
    const bots = users.filter(user => 
      user.id.startsWith('bot_') && !existingDmUserIds.has(user.id)
    );

    return { dmChannels, availableBots: bots };
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
          {/* Bot Users (both existing DMs and available bots) */}
          {[...dmChannels.filter(c => c.isBot), ...availableBots.map(bot => ({
            id: bot.id,
            displayName: bot.name,
            isBot: true,
            isAvailable: true
          }))].map(item => (
            <button
              key={item.id}
              onClick={() => {
                if ('isAvailable' in item && socket) {
                  socket.createDM(item.id);
                } else {
                  selectChannel(item.id);
                }
              }}
              className={`w-full text-left px-2 py-1 hover:text-zinc-200 transition-colors flex items-center gap-2 ${
                selectedChannelId === item.id ? 'text-zinc-200' : 'text-zinc-400'
              }`}
            >
              {item.displayName}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <path d="M8 10h.01"/>
                <path d="M16 10h.01"/>
                <path d="M8 15h8"/>
              </svg>
            </button>
          ))}

          {/* Regular DM Channels */}
          {dmChannels.filter(c => !c.isBot).map(channel => (
            <button
              key={channel.id}
              onClick={() => selectChannel(channel.id)}
              className={`w-full text-left px-2 py-1 hover:text-zinc-200 transition-colors ${
                selectedChannelId === channel.id ? 'text-zinc-200' : 'text-zinc-400'
              }`}
            >
              {channel.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
} 