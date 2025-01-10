// src/components/ui/Settings.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Fira_Code } from 'next/font/google';
import { useClerk } from '@clerk/nextjs';
import Image from 'next/image';
import { SettingsModal } from './SettingsModal';

const firaCode = Fira_Code({ subsets: ['latin'] });

export function Settings() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'user' | 'chat'>('user');
  const { signOut } = useClerk();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isRejecting) {
      // Reset dark mode after animation
      const timer = setTimeout(() => {
        setIsDarkMode(true);
        setIsRejecting(false);
      }, 1000); // Matches the CSS animation duration
      return () => clearTimeout(timer);
    }
  }, [isRejecting]);

  useEffect(() => {
    if (showGif) {
      // Hide GIF after it plays
      const timer = setTimeout(() => {
        setShowGif(false);
      }, 2000); // Adjust based on your GIF duration
      return () => clearTimeout(timer);
    }
  }, [showGif]);

  const handleThemeToggle = () => {
    if (isDarkMode) {
      setIsRejecting(true);
      setShowGif(true);
    }
  };

  const openSettings = (tab: 'user' | 'chat') => {
    setSettingsTab(tab);
    setSettingsModalOpen(true);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="text-zinc-400 hover:text-zinc-200 transition-colors"
        aria-label="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Settings Menu */}
      {isOpen && (
        <div 
          ref={menuRef}
          className={`${firaCode.className} absolute bottom-full left-0 mb-2 w-48 bg-zinc-800 rounded-md shadow-lg border border-zinc-700 overflow-hidden`}
        >
          {/* Theme Toggle */}
          <div className="p-3 border-b border-zinc-700 relative">
            <div className="flex items-center justify-center space-x-2 text-sm text-zinc-400">
              <span>Dark</span>
              <button
                onClick={handleThemeToggle}
                className="relative inline-flex h-6 w-11 items-center rounded-full bg-[#00b300] bg-opacity-20"
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-zinc-200 transition-transform duration-300
                    ${isDarkMode ? 'translate-x-1' : 'translate-x-6'}
                    ${isRejecting ? 'animate-theme-reject' : ''}
                  `}
                />
              </button>
              <span>Light</span>
            </div>
            {/* GIF Popup */}
            {showGif && (
              <div className="fixed inset-0 flex items-end pb-[25vh] justify-left z-75 pointer-events-none">
                <div className="bg-transparent w-32 h-32 flex items-center justify-center">
                  <Image 
                    src="https://i.imgur.com/SEE4F4k.gif" 
                    alt="Wrong!"
                    width={128}
                    height={128}
                    className="rounded-lg"
                    priority
                    onError={(e) => console.error('GIF failed to load:', e)}
                    onLoad={() => console.log('GIF loaded successfully')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* User Settings */}
          <button
            onClick={() => openSettings('user')}
            className="w-full p-3 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            User Settings
          </button>

          {/* Chat Settings */}
          <button
            onClick={() => openSettings('chat')}
            className="w-full p-3 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Chat Settings
          </button>

          {/* Sign Out */}
          <button
            onClick={() => signOut()}
            className="w-full p-3 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={settingsTab}
      />
    </div>
  );
} 
