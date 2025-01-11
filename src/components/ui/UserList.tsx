// src/components/ui/UserList.tsx
'use client';

import React, { useMemo, useEffect } from 'react';
import { Fira_Code } from 'next/font/google';
import { StatusIndicator } from './StatusIndicator';
import { ClickableUsername } from './ClickableUsername';
import { useUsers } from '@/lib/hooks/useUsers';
import type { User } from '@/types';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface UserListProps {
  className?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function UserList({ className = '', isCollapsed, onToggleCollapse }: UserListProps) {
  const { users } = useUsers();

  useEffect(() => {
    console.log('UserList received updated users:', users);
  }, [users]);

  // Separate and sort users by online status
  const { onlineUsers, offlineUsers } = useMemo(() => {
    const sortByName = (a: User, b: User) => (a.name || '').localeCompare(b.name || '');
    
    const online = users.filter(user => user.status !== 'offline').sort(sortByName);
    const offline = users.filter(user => user.status === 'offline').sort(sortByName);
    
    console.log('UserList categorized users:', { online, offline });
    return { onlineUsers: online, offlineUsers: offline };
  }, [users]);

  const UserItem = ({ user }: { user: User }) => {
    console.log('Rendering UserItem:', { userId: user.id, status: user.status });
    return (
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
  };

  return (
    <div className={`${firaCode.className} ${className} flex flex-col transition-all duration-300 overflow-x-hidden`} style={{ width: isCollapsed ? '24px' : '256px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 text-zinc-400 text-sm">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <span>users</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )}
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
          
          <div className="space-y-1 text-sm overflow-y-auto overflow-x-hidden min-h-0">
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