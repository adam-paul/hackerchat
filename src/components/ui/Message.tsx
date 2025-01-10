// src/components/ui/Message.tsx

import React, { useState, useRef } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Message } from '@/types';
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
}

export function MessageComponent({ message, isHighlighted, onReply, onHighlightMessage }: MessageProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          <ContextMenuItem onClick={handleReplyClick}>
            _reply
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              console.log('Create thread not implemented');
              setContextMenu(null);
            }}
          >
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