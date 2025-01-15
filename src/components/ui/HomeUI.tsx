// src/components/ui/HomeUI.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Fira_Code } from 'next/font/google';
import type { Channel, Message } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useMessages } from '@/lib/hooks/useMessage';
import { useSocket } from '@/lib/socket/context';
import { useSearch } from '@/lib/hooks/useSearch';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { ChannelList } from './ChannelList';
import { Settings } from './Settings';
import { SearchBar } from './SearchBar';
import { MessageComponent } from './Message';
import { ChatSection } from './ChatSection';
import { ChatInput } from './ChatInput';
import { UserListContainer } from './UserListContainer';
import { useChannelStore } from '@/lib/store';
import { selectChannels, selectSelectedChannelId } from '@/lib/store/selectors';

const firaCode = Fira_Code({ subsets: ['latin'] });

export function HomeUI() {
  const { userName, userId, userImageUrl } = useAuthContext();
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    messages, 
    status: messageStatus, 
    error: messageError,
    startLoading: startLoadingMessages,
    setMessages,
    addMessage,
    updateMessage,
    clearMessages,
    setError: setMessageError,
    setCurrentChannel
  } = useMessages();

  const {
    isConnected,
    error: socketError,
    joinChannel,
    leaveChannel,
    sendMessage: sendSocketMessage
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

  // Get channel store state and actions
  const channels = useChannelStore(selectChannels);
  const selectedChannel = useChannelStore(selectSelectedChannelId);
  const { selectChannel, _setError: setChannelError, _setLoading } = useChannelStore();
  const setChannels = useCallback((channels: Channel[]) => {
    useChannelStore.setState({ channels });
  }, []);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    searchMessages(messages, query);
  };

  const handleSearchResultClick = (messageId: string) => {
    setSelectedMessageId(messageId);
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageElement.classList.add('bg-zinc-700/30');
      setTimeout(() => messageElement.classList.remove('bg-zinc-700/30'), 2000);
    }
  };

  // Initial fetch of channels
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        _setLoading(true);
        const res = await fetch('/api/channels');
        if (!res.ok) {
          throw new Error('Failed to fetch channels');
        }
        const data = await res.json();
        const sortChannels = (channels: Channel[]) => {
          return channels.sort((a: Channel, b: Channel) => {
            if ((!a.parentId && !b.parentId) || (a.parentId && b.parentId)) {
              return a.name.localeCompare(b.name);
            }
            return a.parentId ? 1 : -1;
          });
        };
        setChannels(sortChannels(data));
      } catch (error) {
        console.error('Failed to fetch channels:', error);
        setChannelError(error instanceof Error ? error.message : 'Failed to fetch channels');
      } finally {
        _setLoading(false);
      }
    };

    fetchChannels();
  }, [_setLoading, setChannelError, setChannels]);

  // Join/Leave channel when selection changes
  useEffect(() => {
    if (!selectedChannel) {
      clearMessages();
      return;
    }

    // Don't fetch messages or join socket for temporary channels
    if (selectedChannel.startsWith('temp_')) {
      return;
    }

    // Fetch initial messages
    const fetchMessages = async () => {
      try {
        startLoadingMessages();
        const res = await fetch(`/api/channels/${selectedChannel}/messages`);
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
      joinChannel(selectedChannel);
    }

    return () => {
      if (isConnected && selectedChannel && !selectedChannel.startsWith('temp_')) {
        leaveChannel(selectedChannel);
      }
    };
  }, [selectedChannel, isConnected, clearMessages, startLoadingMessages, setMessages, setMessageError, joinChannel, leaveChannel]);

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedChannel || !isConnected) return;

    const messageId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      id: messageId,
      content,
      channelId: selectedChannel,
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
    sendSocketMessage(messageId, selectedChannel, content, undefined, replyTo?.id);
  }, [selectedChannel, isConnected, userId, userName, userImageUrl, replyTo, addMessage, sendSocketMessage]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!selectedChannel || !isConnected) return;

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
        content: fileName,
        fileUrl: url,
        fileName,
        fileType,
        fileSize,
        channelId: selectedChannel,
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
            content: replyTo.content,
            author: {
              id: replyTo.author.id,
              name: replyTo.author.name
            }
          }
        })
      };

      addMessage(optimisticMessage);
      sendSocketMessage(messageId, selectedChannel, fileName, {
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
  }, [selectedChannel, isConnected, userId, userName, userImageUrl, replyTo, addMessage, sendSocketMessage, setMessageError]);

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
    messageInputRef.current?.focus();
  }, []);

  const getChannelPath = (channelId: string): string => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return '';

    const parts: string[] = [channel.name];
    let current = channel;

    // Traverse up the parent chain
    while (current.parentId) {
      const parent = channels.find(c => c.id === current.parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }

    return '_' + parts.join('.');
  };

  // Clear reply indicator on channel change
  useEffect(() => {
    setReplyTo(null);
  }, [selectedChannel]);

  // Handle ESC key and click-away for message highlighting
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMessageId) {
        setSelectedMessageId(null);
      }
    };

    const handleClickAway = (e: MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      const clickedMessage = clickedElement.closest('[id^="message-"]');
      
      // Clear highlight if:
      // 1. Clicked outside any message OR
      // 2. Clicked on a different message than the currently highlighted one
      if (selectedMessageId && 
          (!clickedMessage || 
           clickedMessage.id !== `message-${selectedMessageId}`)) {
        setSelectedMessageId(null);
      }
    };

    document.addEventListener('keydown', handleEscKey);
    document.addEventListener('click', handleClickAway);

    return () => {
      document.removeEventListener('keydown', handleEscKey);
      document.removeEventListener('click', handleClickAway);
    };
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
  const handleSelectChannel = useCallback((channelId: string | null) => {
    selectChannel(channelId);
  }, [selectChannel]);

  return (
    <div className="flex h-screen">
      {/* Left sidebar */}
      <aside className="w-64 bg-zinc-800 p-4 flex flex-col">
        {/* User info */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-200 text-sm">
              {userName?.[0]?.toUpperCase() || 'A'}
            </div>
            <span className="text-zinc-200 text-sm">{userName || 'Anonymous'}</span>
          </div>
        </div>
        
        {/* Channel list */}
        {isLoading ? (
          <div className={`${firaCode.className} text-sm text-zinc-400`}>Loading channels...</div>
        ) : (
          <ChannelList className="flex-1" />
        )}

        {/* Settings */}
        <div className="mt-auto pt-4 border-t border-zinc-700">
          <Settings />
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 bg-zinc-900 flex flex-col h-screen">
        {selectedChannel ? (
          <>
            {/* Channel header */}
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className={`${firaCode.className} text-zinc-200 font-normal`}>
                  {getChannelPath(selectedChannel)}
                </h2>
                {!isConnected && (
                  <span className="text-red-500 text-xs">
                    Disconnected
                  </span>
                )}
              </div>
              <SearchBar
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                searchResults={searchResults}
                onResultClick={handleSearchResultClick}
                onClear={clearSearch}
              />
            </div>
            
            {/* Messages area */}
            <div className="flex-1 overflow-hidden">
              <div className="h-full p-4 overflow-y-auto flex flex-col-reverse">
                {messageStatus === 'loading' ? (
                  <div className={`${firaCode.className} text-sm text-zinc-400`}>
                    Loading messages...
                  </div>
                ) : messageError ? (
                  <div className={`${firaCode.className} text-sm text-red-400`}>
                    {messageError}
                  </div>
                ) : messages.length === 0 ? (
                  <div className={`${firaCode.className} text-sm text-zinc-400`}>
                    No messages yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map(message => (
                      <MessageComponent
                        key={message.id}
                        message={message}
                        isHighlighted={message.id === selectedMessageId}
                        onReply={setReplyTo}
                        onHighlightMessage={setSelectedMessageId}
                        onSelectChannel={selectChannel}
                        onChannelCreated={channel => {
                          const withoutNew = channels.filter((c: Channel) => 
                            c.id !== channel.id && 
                            c.id !== (channel as any).originalId
                          );
                          
                          if ('_remove' in channel) {
                            // If removing, just return the filtered list
                            if (selectedChannel === channel.id) {
                              selectChannel(null);
                            }
                            setChannels(withoutNew);
                            return;
                          }

                          // Add the new channel and sort
                          setChannels([...withoutNew, channel].sort((a: Channel, b: Channel) => {
                            if ((!a.parentId && !b.parentId) || (a.parentId && b.parentId)) {
                              return a.name.localeCompare(b.name);
                            }
                            return a.parentId ? 1 : -1;
                          }));
                        }}
                        onMessageUpdate={updateMessage}
                        onAddMessage={addMessage}
                        channels={channels}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Replace the old message input with the new ChatInput component */}
            <ChatInput
              isConnected={isConnected}
              selectedChannel={selectedChannel}
              replyTo={replyTo}
              onSendMessage={handleSendMessage}
              onCancelReply={() => setReplyTo(null)}
              onFileSelect={handleFileSelect}
              isUploading={isUploading}
              inputRef={messageInputRef}
            />
          </>
        ) : (
          <div className={`${firaCode.className} text-sm flex-1 flex items-center justify-center text-zinc-500`}>
            Select a channel to start chatting
          </div>
        )}
      </main>

      {/* Right Sidebar - Users and Chat */}
      <aside className="bg-zinc-800 p-4 flex flex-col">
        <div className="flex flex-col h-full">
          <UserListContainer
            isCollapsed={isUserListCollapsed}
            onToggleCollapse={() => setIsUserListCollapsed(!isUserListCollapsed)}
            className={`flex-1 ${!isChatSectionCollapsed ? 'max-h-[50%]' : ''}`}
          />
          <ChatSection
            isCollapsed={isChatSectionCollapsed}
            isSidebarCollapsed={isUserListCollapsed}
            onToggleCollapse={() => setIsChatSectionCollapsed(!isChatSectionCollapsed)}
            className={isChatSectionCollapsed ? 'h-auto' : 'h-[50%]'}
          />
        </div>
      </aside>
    </div>
  );
}
