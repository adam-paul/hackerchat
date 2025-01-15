// src/components/ui/HomeUI.tsx
'use client';

import { UserButton } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState, useRef, useCallback } from 'react';
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

export function HomeUI() {
  const { userName, userId, userImageUrl } = useAuthContext();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  
  // Add store hooks
  const { 
    selectedChannelId,
    selectChannel,
    getChannelPath,
    _setError
  } = useChannelStore();
  
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
        setIsLoading(true);
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchChannels();
  }, []);

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

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-800 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <span className={`${firaCode.className} text-zinc-200 text-lg`}>
            hacker_chat
          </span>
          <div className="flex items-center gap-2">
            {socketError && (
              <span className="text-red-500 text-xs" title={socketError}>⚠️</span>
            )}
            <span className={`text-xs ${isConnected ? 'text-green-500' : 'text-red-500'}`} title={isConnected ? 'Connected' : 'Disconnected'}>
              ●
            </span>
            <Settings />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          searchResults={searchResults}
          onResultClick={handleSearchResultClick}
          onClear={clearSearch}
        />

        <div className="border-b border-zinc-700 my-4" />

        <ChannelList
          channels={channels}
          selectedChannel={selectedChannelId}
          onSelectChannel={selectChannel}
          onChannelCreated={(channel) => {
            setChannels(prev => {
              // First remove any existing channel with this ID or matching originalId
              const withoutNew = prev.filter(c => 
                c.id !== channel.id && 
                c.id !== channel.originalId
              );
              
              if ('_remove' in channel) {
                // If removing, just return the filtered list
                if (selectedChannelId === channel.id) {
                  selectChannel(null);
                }
                return withoutNew;
              }

              // Add the new channel and sort
              return [...withoutNew, channel].sort((a, b) => {
                if ((!a.parentId && !b.parentId) || (a.parentId && b.parentId)) {
                  return a.name.localeCompare(b.name);
                }
                return a.parentId ? 1 : -1;
              });
            });
          }}
          onChannelDeleted={(deletedChannelId) => {
            setChannels(prev => {
              const isChildOf = (channelId: string, parentId: string): boolean => {
                const channel = prev.find(c => c.id === channelId);
                if (!channel) return false;
                if (channel.parentId === parentId) return true;
                if (channel.parentId) return isChildOf(channel.parentId, parentId);
                return false;
              };

              // Remove the deleted channel and all its children
              const remaining = prev.filter(channel => 
                channel.id !== deletedChannelId && 
                !isChildOf(channel.id, deletedChannelId)
              );

              const isInDeletedChannel = (channelId: string): boolean => {
                return channelId === deletedChannelId || 
                       prev.some(c => c.id === deletedChannelId && isChildOf(channelId, c.id));
              };

              if (selectedChannelId && isInDeletedChannel(selectedChannelId)) {
                selectChannel(null);
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

              return remaining;
            });
          }}
          className="flex-1 overflow-y-auto"
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-zinc-900 flex flex-col">
        {selectedChannelId ? (
          <>
            <div className="p-4 border-b border-zinc-800">
              <h1 className={`${firaCode.className} text-zinc-200 text-lg`}>
                {getChannelPath(selectedChannelId)}
              </h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-4xl mx-auto">
                {messageStatus === 'loading' ? (
                  <div className="flex items-center justify-center p-4">
                    <span className={`${firaCode.className} text-sm text-zinc-400`}>
                      Loading messages...
                    </span>
                  </div>
                ) : messageStatus === 'error' ? (
                  <div className="flex items-center justify-center p-4">
                    <span className={`${firaCode.className} text-sm text-red-400`}>
                      {messageError}
                    </span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className={`${firaCode.className} text-sm text-zinc-400`}>
                    No messages yet
                  </div>
                ) : (
                  <div key={selectedChannelId}>
                    {messages.map(message => (
                      <MessageComponent
                        key={message.id}
                        message={message}
                        isHighlighted={message.id === selectedMessageId}
                        onReply={handleReply}
                        onHighlightMessage={setSelectedMessageId}
                        onSelectChannel={selectChannel}
                        onAddMessage={addMessage}
                        onChannelCreated={(newChannel) => {
                          setChannels(prev => {
                            // First remove any existing channel with this ID or matching originalId
                            const withoutNew = prev.filter(channel => 
                              channel.id !== newChannel.id && 
                              channel.id !== newChannel.originalId
                            );
                            
                            if ('_remove' in newChannel) {
                              // If removing, just return the filtered list
                              if (selectedChannelId === newChannel.id) {
                                selectChannel(null);
                              }
                              return withoutNew;
                            }

                            // Add the new channel and sort
                            return [...withoutNew, newChannel].sort((a, b) => {
                              if ((!a.parentId && !b.parentId) || (a.parentId && b.parentId)) {
                                return a.name.localeCompare(b.name);
                              }
                              return a.parentId ? 1 : -1;
                            });
                          });
                        }}
                        onMessageUpdate={updateMessage}
                        channels={channels}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ChatInput
              isConnected={isConnected}
              selectedChannel={selectedChannelId}
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
