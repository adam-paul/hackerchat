'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Fira_Code } from 'next/font/google';
import { StatusIndicator } from './StatusIndicator';
import { useSocket } from '@/lib/socket/context';
import { useUsers } from '@/lib/hooks/useUsers';
import { useAuthContext } from '@/lib/auth/context';

const firaCode = Fira_Code({ subsets: ['latin'] });

type SettingsTab = 'user' | 'chat';
type UserStatus = 'online' | 'away' | 'busy' | 'offline';
type UserSettingType = 'status'; // More settings can be added here

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsModal({ isOpen, onClose, initialTab = 'user' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [activeSetting, setActiveSetting] = useState<UserSettingType>('status');
  const modalRef = useRef<HTMLDivElement>(null);
  const { updateStatus } = useSocket();
  const { users } = useUsers();
  const { userId } = useAuthContext();
  const currentUser = users.find(user => user.id === userId);
  const [currentStatus, setCurrentStatus] = useState<UserStatus>('online');

  // Set initial status from current user
  useEffect(() => {
    if (currentUser?.status) {
      setCurrentStatus(currentUser.status as UserStatus);
    }
  }, [currentUser]);

  // Reset active tab when initial tab changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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

  const handleStatusChange = (status: UserStatus) => {
    if (!userId) return;
    
    // Store previous status for rollback
    const previousStatus = currentStatus;
    
    // Update local state immediately (optimistic update)
    setCurrentStatus(status);
    
    // Send update to server
    try {
      updateStatus(status);
    } catch (error) {
      console.error('Failed to update status:', error);
      // Revert on error
      setCurrentStatus(previousStatus);
    }
  };

  const StatusOption = ({ status, label }: { status: UserStatus; label: string }) => (
    <button
      onClick={() => handleStatusChange(status)}
      className={`flex items-center space-x-2 w-full px-2 py-1 text-sm rounded transition-colors ${
        currentStatus === status ? 'bg-zinc-700' : 'hover:bg-zinc-700/30'
      }`}
    >
      <StatusIndicator status={status} className="scale-75" />
      <span className="text-zinc-300 text-sm">{label}</span>
    </button>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className={`${firaCode.className} bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-zinc-200 text-lg">settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700">
          <button
            onClick={() => setActiveTab('user')}
            className={`flex-1 p-3 text-sm transition-colors ${
              activeTab === 'user'
                ? 'text-[#00b300] border-b-2 border-[#00b300]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            user_settings
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 p-3 text-sm transition-colors ${
              activeTab === 'chat'
                ? 'text-[#00b300] border-b-2 border-[#00b300]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            chat_settings
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto">
          {activeTab === 'user' ? (
            <div>
              {/* Status Selection */}
              <div className="flex">
                <div className="w-1/4 pr-4">
                  <button
                    onClick={() => setActiveSetting('status')}
                    className={`text-sm px-2 py-1 rounded transition-colors text-zinc-200 w-full text-left ${
                      activeSetting === 'status' ? 'bg-zinc-700' : 'hover:bg-zinc-700/30'
                    }`}
                  >
                    status
                  </button>
                </div>
                <div className="border-l border-zinc-700" />
                <div className="flex-1 pl-4 space-y-1">
                  <StatusOption status="online" label="online" />
                  <StatusOption status="away" label="away <AFK>" />
                  <StatusOption status="busy" label="busy <DND>" />
                  <StatusOption status="offline" label="appear offline" />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-zinc-400 text-sm">
              Chat settings coming soon...
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 