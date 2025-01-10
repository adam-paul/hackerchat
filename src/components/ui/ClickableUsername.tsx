'use client';

import React, { useState } from 'react';
import { UserProfileModal } from './UserProfileModal';

interface ClickableUsernameProps {
  user: {
    id: string;
    name?: string | null;
    imageUrl?: string | null;
    status?: 'online' | 'offline' | 'away' | 'busy';
  };
  className?: string;
}

export function ClickableUsername({ user, className = '' }: ClickableUsernameProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const getStatusTag = () => {
    switch (user.status) {
      case 'away':
        return ' <AFK>';
      case 'busy':
        return ' <DND>';
      default:
        return '';
    }
  };

  return (
    <>
      <button
        onClick={() => setIsProfileOpen(true)}
        className={`hover:text-zinc-200 transition-colors ${className}`}
      >
        {user.name || 'Anonymous User'}{getStatusTag()}
      </button>

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
      />
    </>
  );
} 