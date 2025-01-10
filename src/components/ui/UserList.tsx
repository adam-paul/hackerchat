// src/components/ui/UserList.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Fira_Code } from 'next/font/google';
import { StatusIndicator } from './StatusIndicator';
import { ClickableUsername } from './ClickableUsername';
import type { User } from '@/types';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface UserListProps {
  users: User[];
  className?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function UserList({ users, className = '', isCollapsed, onToggleCollapse }: UserListProps) {
  // Separate and sort users by online status
  const { onlineUsers, offlineUsers } = useMemo(() => {
    const sortByName = (a: User, b: User) => (a.name || '').localeCompare(b.name || '');
    
    return {
      onlineUsers: users.filter(user => user.status !== 'offline').sort(sortByName),
      offlineUsers: users.filter(user => user.status === 'offline').sort(sortByName)
    };
  }, [users]);

  const UserItem = ({ user }: { user: User }) => (
    <div className="flex items-center justify-between px-2 py-1">
      <ClickableUsername
        user={user}
        className={`${user.status === 'offline' ? 'text-zinc-500' : 'text-[#00b300]'}`}
      />
      <StatusIndicator 
        status={user.status || 'offline'}
        className="flex-shrink-0"
      />
    </div>
  );

  return (
    <div className={`${firaCode.className} ${className} flex flex-col h-full transition-all duration-300 overflow-x-hidden`} style={{ width: isCollapsed ? '24px' : '256px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 text-zinc-400 text-sm">
        {!isCollapsed && <span>users</span>}
        <button 
          onClick={onToggleCollapse}
          className="hover:text-zinc-200 transition-colors h-full flex items-center justify-center"
          style={{ width: '24px' }}
          aria-label={isCollapsed ? 'Expand users list' : 'Collapse users list'}
        >
          {isCollapsed ? '<' : '>'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="border-b border-zinc-700 mb-2" />
          
          <div className="space-y-1 text-sm overflow-y-auto overflow-x-hidden">
            {/* Online Users Section */}
            {onlineUsers.length > 0 && (
              <div className="space-y-1">
                {onlineUsers.map((user) => (
                  <UserItem key={user.id} user={user} />
                ))}
              </div>
            )}

            {/* Offline Users Section */}
            {offlineUsers.length > 0 && (
              <div className="space-y-1">
                {offlineUsers.map((user) => (
                  <UserItem key={user.id} user={user} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
} 