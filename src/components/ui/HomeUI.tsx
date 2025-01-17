// src/components/ui/HomeUI.tsx
'use client';

import { UserButton } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ChannelList } from './ChannelList';
import { Settings } from './Settings';
import type { Channel, Message } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useMessages } from '@/lib/hooks/useMessage';
import { useSocket } from '@/lib/socket/context';
import { SearchBar } from './SearchBar';
import { useSearch } from '@/lib/hooks/useSearch';
import { UserListContainer } from './UserListContainer';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { MessageComponent } from './Message';
import { ChatSection } from './ChatSection';
import { ChatInput } from './ChatInput';
import { useChannelStore } from '@/lib/store/channel';

const firaCode = Fira_Code({ subsets: ['latin'] });

// Dynamically import components that depend on window/DOM
const DynamicUserButton = dynamic(() => Promise.resolve(UserButton), {
  ssr: false
});

export function HomeUI() {
  // Add client-side only state
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { userName, userId, userImageUrl } = useAuthContext();
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [highlightedMessage, setHighlightedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  
  // Add store hooks
  const { 
    selectedChannelId, 
    selectChannel,
    channels,
    getChannelPath,
    getChannel,
    handleChannelCreated: storeHandleChannelCreated,
    handleChannelUpdated: storeHandleChannelUpdated,
    handleChannelDeleted: storeHandleChannelDeleted,
    _setError: setStoreError,
    _setChannels: setStoreChannels
  } = useChannelStore();

  const { 
    messages, 
    status: messageStatus, 
    error: messageError,
    startLoading: startLoadingMessages,
    setMessages,
    addMessage,
    updateMessage,
    updateMessageFields,
    clearMessages,
    setError: setMessageError,
    setCurrentChannel
  } = useMessages();

  const {
    isConnected,
    error: socketError,
    joinChannel,
    leaveChannel,
    sendMessage: sendSocketMessage,
    socket
  } = useSocket();

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    selectedMessageId,
    setSelectedMessageId,
    searchMessages,
    clearSearch,
  } = useSearch();

  const [isUserListCollapsed, setIsUserListCollapsed] = useLocalStorage('userListCollapsed', false);
  const [isChatSectionCollapsed, setIsChatSectionCollapsed] = useLocalStorage('chatSectionCollapsed', false);

  // Get the selected channel
  const selectedChannel = selectedChannelId ? getChannel(selectedChannelId) : null;
  const isDM = selectedChannel?.type === "DM";
  const otherParticipant = isDM ? selectedChannel?.participants?.find(p => p.id !== userId) : null;

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    searchMessages(messages, query);
  };

  const handleSearchResultClick = (messageId: string) => {
    setSelectedMessageId(messageId);
  };

  // Socket event handlers
  const handleSocketChannelCreated = useCallback((channel: Channel) => {
    storeHandleChannelCreated(channel);
  }, [storeHandleChannelCreated]);

  const handleSocketChannelUpdated = useCallback((channel: Channel) => {
    storeHandleChannelUpdated(channel);
  }, [storeHandleChannelUpdated]);

  const handleSocketChannelDeleted = useCallback((channelId: string) => {
    storeHandleChannelDeleted(channelId);
  }, [storeHandleChannelDeleted]);

  // Handle socket events
  useEffect(() => {
    if (!socket) return;

    socket.on('channel:created', handleSocketChannelCreated);
    socket.on('channel:updated', handleSocketChannelUpdated);
    socket.on('channel:deleted', handleSocketChannelDeleted);

    return () => {
      if (!socket) return;
      socket.off('channel:created', handleSocketChannelCreated);
      socket.off('channel:updated', handleSocketChannelUpdated);
      socket.off('channel:deleted', handleSocketChannelDeleted);
    };
  }, [socket, handleSocketChannelCreated, handleSocketChannelUpdated, handleSocketChannelDeleted]);

  // Initial fetch of channels
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/channels');
        if (!res.ok) {
          throw new Error('Failed to fetch channels');
        }
        const data = await res.json();
        setStoreChannels(data);
      } catch (error) {
        console.error('Failed to fetch channels:', error);
        setStoreError(error instanceof Error ? error.message : 'Failed to fetch channels');
      } finally {
        setIsLoading(false);
      }
    };

    fetchChannels();
  }, [setStoreError, setStoreChannels]);

  // Join/Leave channel when selection changes
  useEffect(() => {
    if (!selectedChannelId) {
      clearMessages();
      return;
    }

    // Don't fetch messages or join socket for temporary channels
    if (selectedChannelId.startsWith('temp_')) {
      return;
    }

    // Fetch initial messages
    const fetchMessages = async () => {
      try {
        startLoadingMessages();
        const res = await fetch(`/api/channels/${selectedChannelId}/messages`);
        if (!res.ok) {
          throw new Error('Failed to fetch messages');
        }
        const data = await res.json();
        setMessages(data);
      } catch (error) {
        console.error('Failed to fetch messages:', error);
        setMessageError(error instanceof Error ? error.message : 'Failed to fetch messages');
      }
    };

    fetchMessages();

    // Join socket channel
    if (isConnected) {
      joinChannel(selectedChannelId);
    }

    return () => {
      if (isConnected && selectedChannelId && !selectedChannelId.startsWith('temp_')) {
        leaveChannel(selectedChannelId);
      }
    };
  }, [selectedChannelId, isConnected, clearMessages, startLoadingMessages, setMessages, setMessageError, joinChannel, leaveChannel]);

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedChannelId || !isConnected) return;

    const messageId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      id: messageId,
      originalId: messageId,
      content,
      channelId: selectedChannelId,
      createdAt: new Date().toISOString(),
      author: {
        id: userId || 'optimistic',
        name: userName || 'Anonymous',
        imageUrl: userImageUrl || '',
      },
      reactions: [],
      ...(replyTo && {
        replyTo: {
          id: replyTo.id,
          originalId: replyTo.originalId || replyTo.id,
          content: replyTo.content,
          author: {
            id: replyTo.author.id,
            name: replyTo.author.name
          }
        }
      })
    };

    addMessage(optimisticMessage);
    setReplyTo(null);
    sendSocketMessage(messageId, selectedChannelId, content, undefined, replyTo?.id);
  }, [selectedChannelId, isConnected, userId, userName, userImageUrl, replyTo, addMessage, sendSocketMessage]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!selectedChannelId || !isConnected) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file');
      }

      const { url, fileName, fileType, fileSize } = await uploadRes.json();
      const messageId = `temp_${Date.now()}`;

      const optimisticMessage: Message = {
        id: messageId,
        originalId: messageId,
        content: fileName,
        fileUrl: url,
        fileName,
        fileType,
        fileSize,
        channelId: selectedChannelId,
        createdAt: new Date().toISOString(),
        author: {
          id: userId || 'optimistic',
          name: userName || 'Anonymous',
          imageUrl: userImageUrl || '',
        },
        reactions: [],
        ...(replyTo && {
          replyTo: {
            id: replyTo.id,
            originalId: replyTo.originalId || replyTo.id,
            content: replyTo.content,
            author: {
              id: replyTo.author.id,
              name: replyTo.author.name
            }
          }
        })
      };

      addMessage(optimisticMessage);
      sendSocketMessage(messageId, selectedChannelId, fileName, {
        fileUrl: url,
        fileName,
        fileType,
        fileSize
      }, replyTo?.id);
    } catch (error) {
      console.error('Failed to upload file:', error);
      setMessageError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  }, [selectedChannelId, isConnected, userId, userName, userImageUrl, replyTo, addMessage, sendSocketMessage, setMessageError]);

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
    messageInputRef.current?.focus();
  }, []);

  const handleCancelReply = useCallback((message: Message) => {
    setReplyTo(null);
  }, []);

  const formatChannelPath = (channelId: string): string => {
    const path = getChannelPath(channelId);
    return '_' + path.join('.');
  };

  // Clear reply indicator on channel change
  useEffect(() => {
    setReplyTo(null);
  }, [selectedChannelId]);

  // Handle ESC key for message highlighting
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMessageId) {
        setSelectedMessageId(null);
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [selectedMessageId, setSelectedMessageId]);

  // Auto-clear highlight after delay
  useEffect(() => {
    if (selectedMessageId) {
      const timer = setTimeout(() => {
        setSelectedMessageId(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [selectedMessageId, setSelectedMessageId]);

  // Update replyTo when a message gets its permanent ID
  useEffect(() => {
    if (replyTo && messages.length > 0) {
      const updatedMessage = messages.find(m => 
        m.id === replyTo.id || // Check permanent ID
        (m.originalId === replyTo.id && m.id !== replyTo.id) // Check if temp ID was updated
      );

      if (updatedMessage && updatedMessage.id !== replyTo.id) {
        setReplyTo(updatedMessage);
      }
    }
  }, [messages, replyTo]);

  // Update channel selection
  const handleSelectChannel = (channelId: string | null) => {
    selectChannel(channelId);
    setCurrentChannel(channelId);
  };

  const handleMessageHighlight = useCallback((m: Message) => {
    setHighlightedMessage(m.id);
    setTimeout(() => setHighlightedMessage(null), 2000);
  }, []);

  const handleChannelCreated = useCallback((newChannel: Channel) => {
    setStoreChannels(channels.reduce((acc: Channel[], channel: Channel) => {
      // Skip if channel has matching id or originalId
      if (channel.id === newChannel.id || 
          channel.id === (newChannel as any).originalId) {
        return acc;
      }
      return [...acc, channel];
    }, []));

    // If not removing, add the new channel
    if (!('_remove' in newChannel)) {
      setStoreChannels([
        ...channels.filter(channel => 
          channel.id !== newChannel.id && 
          channel.id !== (newChannel as any).originalId
        ),
        newChannel
      ].sort((a, b) => {
        if ((!a.parentId && !b.parentId) || (a.parentId && b.parentId)) {
          return a.name.localeCompare(b.name);
        }
        return a.parentId ? 1 : -1;
      }));
    } else if (selectedChannelId === newChannel.id) {
      selectChannel(null);
    }
  }, [channels, selectedChannelId, selectChannel, setStoreChannels]);

  const handleChannelDeleted = useCallback((deletedChannelId: string) => {
    const isChildOf = (channelId: string, parentId: string): boolean => {
      const channel = channels.find(c => c.id === channelId);
      if (!channel) return false;
      if (channel.parentId === parentId) return true;
      return channel.parentId ? isChildOf(channel.parentId, parentId) : false;
    };

    // Filter out the deleted channel and all its descendants
    const remainingChannels = channels.filter(channel => 
      channel.id !== deletedChannelId && !isChildOf(channel.id, deletedChannelId)
    );

    setStoreChannels(remainingChannels);

    // If we're in the deleted channel or any of its children, return to channel select
    if (selectedChannelId && (
      selectedChannelId === deletedChannelId || 
      isChildOf(selectedChannelId, deletedChannelId)
    )) {
      handleSelectChannel(null);
    }

    // Update messages to clear thread links for the deleted channel
    messages.forEach(message => {
      if (message.threadId === deletedChannelId) {
        const updatedMessage = {
          ...message,
          threadId: undefined,
          threadName: undefined
        };
        updateMessage(message.id, updatedMessage);
      }
    });
  }, [channels, selectedChannelId, handleSelectChannel, messages, updateMessage, setStoreChannels]);

  return (
    <div className={`${firaCode.className} flex h-screen bg-zinc-900 text-zinc-200`}>
      {/* Left sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-800 p-4 overflow-y-auto">
        <ChannelList />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            {selectedChannelId && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400">in</span>
                {isDM ? (
                  <span className="text-[#00b300]">{otherParticipant?.name || 'Unknown User'}</span>
                ) : (
                  <span className="text-[#00b300]">{getChannelPath(selectedChannelId).join(' / ')}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <SearchBar 
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onResultClick={handleSearchResultClick}
              searchResults={searchResults}
              onClear={clearSearch}
            />
            <DynamicUserButton />
            <Settings />
          </div>
        </header>

        {/* Message area */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col overflow-y-auto p-4">
            {messages.map((message) => (
              <MessageComponent
                key={message.id}
                message={message}
                onReply={handleReply}
                onMessageUpdate={updateMessage}
                onMessageFieldsUpdate={updateMessageFields}
                onAddMessage={addMessage}
                isHighlighted={message.id === highlightedMessage}
                onHighlightMessage={setSelectedMessageId}
              />
            ))}
          </div>

          {/* Right sidebar */}
          <div className="w-64 flex-shrink-0 border-l border-zinc-800 flex flex-col">
            <UserListContainer 
              isCollapsed={isUserListCollapsed}
              onToggleCollapse={() => setIsUserListCollapsed(!isUserListCollapsed)}
            />
            <ChatSection
              isCollapsed={isChatSectionCollapsed}
              isSidebarCollapsed={isUserListCollapsed}
              onToggleCollapse={() => setIsChatSectionCollapsed(!isChatSectionCollapsed)}
              className="mt-4"
            />
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-zinc-800">
          <ChatInput
            isConnected={isConnected}
            selectedChannel={selectedChannelId}
            onSendMessage={handleSendMessage}
            onFileSelect={handleFileSelect}
            isUploading={isUploading}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            inputRef={messageInputRef}
          />
        </div>
      </div>
    </div>
  );
}
