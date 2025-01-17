'use client';

import React, { useMemo } from 'react';
import { Fira_Code } from 'next/font/google';
import { useChannelStore } from '@/lib/store/channel';
import { useAuthContext } from '@/lib/auth/context';

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
  
  // Combine selectors into a single selector to prevent unnecessary re-renders
  const { dmChannels, selectedChannelId, selectChannel } = useChannelStore(state => ({
    dmChannels: state.getDMChannels(),
    selectedChannelId: state.selectedChannelId,
    selectChannel: state.selectChannel
  }));

  // Memoize participant name lookup
  const dmChannelsWithNames = useMemo(() => 
    dmChannels.map(channel => ({
      ...channel,
      displayName: channel.participants?.find(p => p.id !== userId)?.name || 'Unknown User'
    }))
  , [dmChannels, userId]);

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
          {dmChannelsWithNames.map(channel => (
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