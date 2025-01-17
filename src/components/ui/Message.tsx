// src/components/ui/Message.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Message, Channel, Reaction } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useSocket } from '@/lib/socket/context';
import { useChannelStore } from '@/lib/store/channel';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { ClickableUsername } from './ClickableUsername';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface MessageProps {
  message: Message;
  isHighlighted?: boolean;
  onReply?: (message: Message) => void;
  onHighlightMessage?: (messageId: string) => void;
  onMessageUpdate?: (id: string, message: Message) => void;
  onMessageFieldsUpdate?: (id: string, updates: { threadId?: string; threadMetadata?: { title: string; createdAt: string } }) => void;
  onAddMessage?: (message: Message) => void;
}

export const MessageComponent = React.memo(function MessageComponent({ 
  message, 
  isHighlighted, 
  onReply, 
  onHighlightMessage,
  onMessageUpdate,
  onMessageFieldsUpdate,
  onAddMessage
}: MessageProps) {
  // Validate message prop
  if (!message || typeof message !== 'object') {
    console.error('Invalid message prop:', message);
    return null;
  }

  // Ensure required fields exist
  if (!message.id || !message.channelId || !message.author) {
    console.error('Message missing required fields:', message);
    return null;
  }

  // Ensure author has required fields
  if (!message.author.id) {
    console.error('Message author missing required fields:', message);
    return null;
  }

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [threadName, setThreadName] = useState('');
  const [isReacting, setIsReacting] = useState(false);
  const [reactionInput, setReactionInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userId } = useAuthContext();
  const { socket } = useSocket();
  const channels = useChannelStore(state => state.channels);
  const selectChannel = useChannelStore(state => state.selectChannel);
  const createThread = useChannelStore(state => state.createThread);
  const messageRef = useRef<HTMLDivElement>(null);
  const reactionInputRef = useRef<HTMLInputElement>(null);
  const threadInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!isNaming) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (threadInputRef.current && !threadInputRef.current.contains(event.target as Node)) {
        setIsNaming(false);
        setThreadName('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNaming]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = messageRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY
      });
    }
  }, []);

  const handleDelete = useCallback(() => {
    if (socket && message.id) {
      socket.deleteMessage(message.id);
    }
    setContextMenu(null);
  }, [socket, message.id]);

  const handleReplyClick = useCallback(() => {
    onReply?.(message);
    setContextMenu(null);
  }, [onReply, message]);

  const handleReplyPreviewClick = useCallback(() => {
    if (message.replyTo) {
      // Try both IDs when highlighting, prioritizing the original ID
      onHighlightMessage?.(message.replyTo.originalId || message.replyTo.id);
    }
  }, [message.replyTo, onHighlightMessage]);

  const isOwnMessage = useMemo(() => message.author.id === userId, [message.author.id, userId]);
  const hasUserReacted = useMemo(() => message.reactions?.some(reaction => reaction.user.id === userId), [message.reactions, userId]);

  const isMaxDepth = useMemo(() => channels.some(c => {
    if (c.id === message.channelId) {
      if (c.parentId) {
        const parent = channels.find(p => p.id === c.parentId);
        return parent?.parentId !== null;
      }
    }
    return false;
  }), [channels, message.channelId]);

  const handleCreateThread = useCallback(() => {
    if (isMaxDepth) return;
    setContextMenu(null);
    setIsNaming(true);
  }, [isMaxDepth]);

  const handleThreadNameSubmit = useCallback(async () => {
    if (isSubmitting || !threadName.trim()) return;
    
    setIsSubmitting(true);
    const name = threadName.trim();
    
    // Clear UI immediately
    setThreadName('');
    setIsNaming(false);

    // Update the message locally first with optimistic data
    onMessageFieldsUpdate?.(message.id, {
      threadId: `temp_${name}`,
      threadMetadata: {
        title: name,
        createdAt: new Date().toISOString()
      }
    });

    try {
      await createThread(name, message.channelId, message);
    } catch (error) {
      console.error('Failed to create thread:', error);
      setThreadName(name);
      setIsNaming(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, threadName, createThread, message, onMessageFieldsUpdate]);

  const handleThreadNameKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleThreadNameSubmit();
    } else if (e.key === 'Escape') {
      setIsNaming(false);
      setThreadName('');
    }
  }, [handleThreadNameSubmit]);

  const handleReactionClick = useCallback(() => {
    if (hasUserReacted) return;
    setContextMenu(null);
    setIsReacting(true);
  }, [hasUserReacted]);

  const handleReactionSubmit = useCallback(() => {
    if (!reactionInput.trim() || !socket) return;
    
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

    onMessageUpdate?.(message.id, {
      ...message,
      reactions: [...(message.reactions || []), optimisticReaction],
    });
    
    socket.addReaction(message.channelId, message.id, reactionInput);
    setIsReacting(false);
    setReactionInput('');
  }, [reactionInput, socket, userId, message, onMessageUpdate]);

  const handleRemoveReaction = useCallback((reactionId: string) => {
    if (!socket) return;

    onMessageUpdate?.(message.id, {
      ...message,
      reactions: (message.reactions || []).filter(r => r.id !== reactionId),
    });
    
    socket.removeReaction(message.channelId, message.id, reactionId);
  }, [socket, message, onMessageUpdate]);

  useEffect(() => {
    if (isHighlighted && messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={messageRef}
      className={`mb-4 transition-colors duration-300 rounded-lg p-2 hover:bg-zinc-700/10 ${
        isHighlighted ? 'bg-zinc-700/30' : ''
      }`}
      onContextMenu={handleContextMenu}
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
            ref={threadInputRef}
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
          onClick={() => selectChannel(message.threadId!)}
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
            <ContextMenuItem 
              onClick={handleCreateThread}
              disabled={isMaxDepth}
              className={isMaxDepth ? "opacity-50 cursor-not-allowed" : ""}
            >
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
}); 