// src/components/ui/Message.tsx

import React, { useState, useRef } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Message, Channel } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useSocket } from '@/lib/socket/context';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { ClickableUsername } from './ClickableUsername';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface MessageProps {
  message: Message;
  isHighlighted?: boolean;
  onReply?: (message: Message) => void;
  onHighlightMessage?: (messageId: string) => void;
  onSelectChannel?: (channelId: string) => void;
  onChannelCreated?: (channel: Channel) => void;
  onMessageUpdate?: (id: string, message: Message) => void;
}

export function MessageComponent({ 
  message, 
  isHighlighted, 
  onReply, 
  onHighlightMessage, 
  onSelectChannel,
  onChannelCreated,
  onMessageUpdate
}: MessageProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [threadName, setThreadName] = useState('');
  const { userId } = useAuthContext();
  const { socket } = useSocket();
  const messageRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = messageRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  const handleDelete = () => {
    if (socket && message.id) {
      socket.deleteMessage(message.id);
    }
    setContextMenu(null);
  };

  const handleReplyClick = () => {
    onReply?.(message);
    setContextMenu(null);
  };

  const handleReplyPreviewClick = () => {
    if (message.replyTo && onHighlightMessage) {
      onHighlightMessage(message.replyTo.id);
      const replyElement = document.getElementById(`message-${message.replyTo.id}`);
      if (replyElement) {
        replyElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleCreateThread = () => {
    setContextMenu(null);
    setIsNaming(true);
  };

  const handleThreadNameSubmit = async () => {
    if (!threadName.trim()) return;
    
    try {
      // Create the thread with the user-provided name
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: threadName,
          parentId: message.channelId,
          initialMessage: {
            content: message.content,
            authorId: message.author.id,
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            fileType: message.fileType,
            fileSize: message.fileSize
          },
          messageId: message.id // Pass the original message ID to update its thread info
        }),
      });

      if (!response.ok) throw new Error('Failed to create thread');
      
      const newThread = await response.json();
      
      // Add the new channel to the UI
      onChannelCreated?.(newThread);

      // Update the message with thread info
      const updatedMessage = {
        ...message,
        threadId: newThread.id,
        threadName: threadName
      };
      onMessageUpdate?.(message.id, updatedMessage);

      setIsNaming(false);
      setThreadName('');
    } catch (error) {
      console.error('Failed to create thread:', error);
    }
  };

  const isOwnMessage = message.author.id === userId;

  return (
    <div
      ref={messageRef}
      id={`message-${message.id}`}
      onContextMenu={handleContextMenu}
      className={`mb-4 transition-colors duration-300 rounded-lg p-2 hover:bg-zinc-700/10 ${
        isHighlighted ? 'bg-zinc-700/30' : ''
      }`}
    >
      {message.replyTo && (
        <div 
          onClick={handleReplyPreviewClick}
          className={`${firaCode.className} mb-1 text-xs text-zinc-500 hover:text-zinc-400 cursor-pointer flex items-center gap-1`}
        >
          <span>↱</span>
          <span className="text-[#00b300]">{message.replyTo.author.name || 'Unknown'}</span>
          <span>:</span>
          <span className="truncate max-w-[300px]">{message.replyTo.content}</span>
        </div>
      )}
      
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline">
          <ClickableUsername
            user={message.author}
            className={`${firaCode.className} text-sm font-medium text-[#00b300]`}
          />
          <span className={`${firaCode.className} ml-2 text-xs text-zinc-500`}>
            {new Date(message.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {message.fileUrl ? (
        <div className="mt-1">
          {message.fileType?.startsWith('image/') ? (
            <img 
              src={message.fileUrl} 
              alt={message.fileName || 'Attached image'} 
              className="max-w-md max-h-64 rounded object-contain"
            />
          ) : (
            <a 
              href={message.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${firaCode.className} text-sm text-[#00b300] hover:underline flex items-center`}
            >
              📎 {message.fileName}
              {message.fileSize && (
                <span className="ml-2 text-zinc-500">
                  ({Math.round(message.fileSize / 1024)}KB)
                </span>
              )}
            </a>
          )}
        </div>
      ) : (
        <p className={`${firaCode.className} text-sm text-zinc-300`}>
          {message.content}
        </p>
      )}

      {isNaming && (
        <div className={`${firaCode.className} text-xs flex items-center gap-1 pl-4 mt-1`}>
          <span className="text-zinc-400">thread.name</span>
          <input 
            type="text" 
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleThreadNameSubmit();
              } else if (e.key === 'Escape') {
                setIsNaming(false);
                setThreadName('');
              }
            }}
            className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200 text-xs"
            autoFocus
          />
        </div>
      )}

      {message.threadId && message.threadName && (
        <div 
          className={`${firaCode.className} text-xs text-zinc-500 hover:text-zinc-400 cursor-pointer pl-4 mt-1`}
          onClick={() => onSelectChannel?.(message.threadId!)}
        >
          ↳ {message.threadName}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          <ContextMenuItem onClick={handleReplyClick}>
            _reply
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCreateThread}>
            _create.thread
          </ContextMenuItem>
          {isOwnMessage && (
            <ContextMenuItem
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300"
            >
              _delete
            </ContextMenuItem>
          )}
        </ContextMenu>
      )}
    </div>
  );
} 