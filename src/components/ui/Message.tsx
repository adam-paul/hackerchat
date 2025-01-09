// src/components/ui/Message.tsx

import { useState, useRef } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Message } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useSocket } from '@/lib/socket/context';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface MessageProps {
  message: Message;
  isHighlighted?: boolean;
}

export function MessageComponent({ message, isHighlighted }: MessageProps) {
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

  const isOwnMessage = message.author.id === userId;

  return (
    <div
      ref={messageRef}
      onContextMenu={handleContextMenu}
      className={`mb-4 transition-colors duration-300 rounded-lg p-2 hover:bg-zinc-700/10 ${
        isHighlighted ? 'bg-zinc-700/30' : ''
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline">
          <span className={`${firaCode.className} text-sm font-medium text-[#00b300]`}>
            {message.author.name || 'User'}
          </span>
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
          <ContextMenuItem
            onClick={() => {
              console.log('Reply not implemented');
              setContextMenu(null);
            }}
          >
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