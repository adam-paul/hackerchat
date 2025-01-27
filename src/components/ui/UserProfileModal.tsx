'use client';

import React, { useEffect, useRef } from 'react';
import { Fira_Code } from 'next/font/google';
import { StatusIndicator } from './StatusIndicator';
import { useChannelStore } from '@/lib/store/channel';
import { useSocket } from '@/lib/socket/context';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    name?: string | null;
    imageUrl?: string | null;
    status?: 'online' | 'offline' | 'away' | 'busy';
  };
}

export function UserProfileModal({ isOpen, onClose, user }: UserProfileModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const socket = useSocket();
  const { selectChannel } = useChannelStore();

  const handleStartDM = async () => {
    if (!socket.socket) return;
    
    try {
      const channel = await socket.socket.createDM(user.id);
      selectChannel(channel.id);
      onClose();
    } catch (error) {
      console.error('Failed to create DM:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className={`${firaCode.className} bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-[320px] overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-zinc-200 text-lg">profile</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex flex-col items-center space-y-4">
            {/* Profile Picture */}
            <div className="relative">
              <img
                src={user.imageUrl || 'https://via.placeholder.com/100'}
                alt={user.name || 'User'}
                className="w-24 h-24 rounded-full border-2 border-zinc-700"
              />
              <div className="absolute bottom-0 right-0">
                <StatusIndicator status={user.status || 'offline'} className="border-2 border-zinc-800" />
              </div>
            </div>

            {/* Username */}
            <div className="text-zinc-200 text-lg">
              {user.name || 'Anonymous User'}
            </div>

            {/* Status */}
            <div className="text-zinc-400 text-sm">
              {user.status || 'offline'}
            </div>

            {/* Chat Button */}
            <button
              onClick={handleStartDM}
              className="w-full flex items-center justify-center space-x-2 py-2 px-4 text-zinc-200 hover:text-white border border-zinc-700 rounded transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span>chat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 