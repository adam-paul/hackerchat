// src/components/ui/Message.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Message, Channel, Reaction } from '@/types';
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
  const [isReacting, setIsReacting] = useState(false);
  const [reactionInput, setReactionInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userId } = useAuthContext();
  const { socket } = useSocket();
  const messageRef = useRef<HTMLDivElement>(null);
  const reactionInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isReacting) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (reactionInputRef.current && !reactionInputRef.current.contains(event.target as Node)) {
        setIsReacting(false);
        setReactionInput('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isReacting]);

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
    if (isSubmitting || !threadName.trim()) return;
    
    setIsSubmitting(true);
    const name = threadName.trim();
    
    // Create optimistic thread immediately
    const tempId = `temp_${name}`;
    const optimisticThread = {
      id: tempId,
      name,
      parentId: message.channelId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Clear UI immediately with optimistic update
    setThreadName('');
    setIsNaming(false);
    
    // Update UI optimistically
    onChannelCreated?.(optimisticThread);
    const optimisticMessageUpdate = {
      ...message,
      threadId: tempId,
      threadName: name
    };
    onMessageUpdate?.(message.id, optimisticMessageUpdate);
    
    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          parentId: message.channelId,
          initialMessage: {
            content: message.content,
            authorId: message.author.id,
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            fileType: message.fileType,
            fileSize: message.fileSize
          },
          messageId: message.id,
          originalId: tempId // Pass the optimistic ID
        }),
      });

      if (!response.ok) throw new Error('Failed to create thread');
      
      const newThread = await response.json();
      
      // Replace optimistic thread with real one using same ID
      onChannelCreated?.({...newThread, id: tempId});
      
      // Update the message with thread info (using same ID)
      const updatedMessage = {
        ...message,
        threadId: tempId,
        threadName: name
      };
      onMessageUpdate?.(message.id, updatedMessage);
    } catch (error) {
      console.error('Failed to create thread:', error);
      // Remove optimistic updates on error
      onChannelCreated?.({...optimisticThread, _remove: true});
      onMessageUpdate?.(message.id, message); // Restore original message
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThreadNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleThreadNameSubmit();
    } else if (e.key === 'Escape') {
      setIsNaming(false);
      setThreadName('');
    }
  };

  const handleReactionClick = () => {
    if (hasUserReacted) return;
    setContextMenu(null);
    setIsReacting(true);
  };

  const handleReactionSubmit = () => {
    if (!reactionInput.trim() || !socket) return;
    
    // Create optimistic reaction
    const optimisticReaction: Reaction = {
      id: `optimistic-${Date.now()}`,
      content: reactionInput,
      createdAt: new Date().toISOString(),
      user: {
        id: userId!,
        name: null,
        imageUrl: null,
      },
    };

    // Update message with optimistic reaction
    onMessageUpdate?.(message.id, {
      ...message,
      reactions: [...(message.reactions || []), optimisticReaction],
    });
    
    // Send to server
    socket.addReaction(message.channelId, message.id, reactionInput);
    setIsReacting(false);
    setReactionInput('');
  };

  const handleRemoveReaction = (reactionId: string) => {
    if (!socket) return;

    // Optimistically remove the reaction
    onMessageUpdate?.(message.id, {
      ...message,
      reactions: (message.reactions || []).filter(r => r.id !== reactionId),
    });
    
    socket.removeReaction(message.channelId, message.id, reactionId);
  };

  const isOwnMessage = message.author.id === userId;
  const hasUserReacted = message.reactions?.some(reaction => reaction.user.id === userId);

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
          {isReacting && (
            <div className={`${firaCode.className} text-xs flex items-center ml-2`}>
              <input 
                ref={reactionInputRef}
                type="text"
                value={reactionInput}
                onChange={(e) => {
                  if (e.target.value.length <= 10) {
                    setReactionInput(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleReactionSubmit();
                  } else if (e.key === 'Escape') {
                    setIsReacting(false);
                    setReactionInput('');
                  }
                }}
                placeholder="ASCII react"
                className="bg-transparent border border-zinc-700 rounded px-1 py-0.5 focus:outline-none focus:border-[#00b300] text-zinc-200 w-24 placeholder:text-zinc-600"
                maxLength={10}
                autoFocus
              />
            </div>
          )}
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

      {message.reactions && message.reactions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1 pl-4">
          {message.reactions.map((reaction) => (
            <div
              key={reaction.id}
              onClick={() => reaction.user.id === userId && handleRemoveReaction(reaction.id)}
              className={`${firaCode.className} text-xs px-1.5 py-0.5 rounded bg-zinc-800/50 hover:bg-zinc-800 cursor-pointer flex items-center gap-1 group ${
                reaction.user.id === userId ? 'hover:bg-red-900/20' : ''
              }`}
              title={`Added by ${reaction.user.name || 'Anonymous'}`}
            >
              <span>{reaction.content}</span>
              {reaction.user.id === userId && (
                <span className="text-zinc-500 group-hover:text-red-400">×</span>
              )}
            </div>
          ))}
        </div>
      )}

      {isNaming && (
        <div className={`${firaCode.className} text-xs flex items-center gap-1 pl-4 mt-1`}>
          <span className="text-zinc-400">thread.name</span>
          <input
            type="text"
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            onKeyDown={handleThreadNameKeyPress}
            className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200 text-xs"
            autoFocus
            disabled={isSubmitting}
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
          <div className="flex flex-col w-full">
            <ContextMenuItem 
              onClick={handleReactionClick}
              disabled={hasUserReacted}
              className={hasUserReacted ? "opacity-50 cursor-not-allowed" : ""}
            >
              _ASCII.react {hasUserReacted}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleReplyClick}>
              _reply
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateThread}>
              _create.thread
            </ContextMenuItem>
            {isOwnMessage && (
              <ContextMenuItem
                onClick={handleDelete}
                className="!text-red-400 hover:!text-red-300"
              >
                _delete
              </ContextMenuItem>
            )}
          </div>
        </ContextMenu>
      )}
    </div>
  );
} 