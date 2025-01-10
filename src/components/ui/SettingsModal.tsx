'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({ subsets: ['latin'] });

type SettingsTab = 'user' | 'chat';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsModal({ isOpen, onClose, initialTab = 'user' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const modalRef = useRef<HTMLDivElement>(null);

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
          <div className="text-zinc-400 text-sm">
            {activeTab === 'user' ? (
              'User settings coming soon...'
            ) : (
              'Chat settings coming soon...'
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 