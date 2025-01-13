'use client';

import React, { useRef, useState } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Message } from '@/types';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface ChatInputProps {
  isConnected: boolean;
  selectedChannel: string | null;
  replyTo: Message | null;
  onSendMessage: (content: string) => void;
  onCancelReply: () => void;
  onFileSelect: (file: File) => void;
  isUploading: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export const ChatInput = React.memo(function ChatInput({
  isConnected,
  selectedChannel,
  replyTo,
  onSendMessage,
  onCancelReply,
  onFileSelect,
  isUploading,
  inputRef
}: ChatInputProps) {
  const [newMessage, setNewMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalMessageInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = inputRef || internalMessageInputRef;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !newMessage.trim() || !isConnected) return;

    onSendMessage(newMessage.trim());
    setNewMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="border-t border-zinc-800">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="relative flex flex-col gap-2">
          {replyTo && (
            <div className={`${firaCode.className} flex items-center gap-1 px-2 py-0.5 text-[14px] rounded bg-zinc-800/50`}>
              <span className="text-zinc-400">replying.to</span>
              <span className="text-[#00b300]">{replyTo.author.name}</span>
              <button
                type="button"
                onClick={onCancelReply}
                className="ml-auto text-zinc-400 hover:text-zinc-200"
                aria-label="Cancel reply"
              >
                ×
              </button>
            </div>
          )}
          <div className="relative flex items-center">
            <span className={`${firaCode.className} absolute left-3 text-zinc-500`}>{'>'}_</span>
            <input
              ref={messageInputRef}
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape' && replyTo) {
                  onCancelReply();
                }
              }}
              placeholder={!isConnected ? 'Disconnected...' : 'Type a message...'}
              disabled={!isConnected}
              className={`${firaCode.className} text-sm w-full pl-10 pr-12 py-2 rounded bg-zinc-800 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#00b300] ${
                !isConnected ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
            <div className="absolute right-3">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt"
                disabled={!isConnected || isUploading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || isUploading}
                className={`${firaCode.className} text-base text-zinc-400 hover:text-zinc-200 transition-colors ${
                  (!isConnected || isUploading) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                aria-label="Attach file"
              >
                {isUploading ? (
                  <span className="animate-pulse">↑</span>
                ) : (
                  '+'
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  return (
    prevProps.isConnected === nextProps.isConnected &&
    prevProps.selectedChannel === nextProps.selectedChannel &&
    prevProps.replyTo?.id === nextProps.replyTo?.id &&
    prevProps.isUploading === nextProps.isUploading
  );
}); 