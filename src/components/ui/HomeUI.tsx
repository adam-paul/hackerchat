// src/components/ui/HomeUI.tsx
'use client';

import { UserButton } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState, useRef } from 'react';
import { ChannelList } from './ChannelList';
import { Settings } from './Settings';
import type { Channel, Message } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useMessages } from '@/lib/hooks/useMessage';
import { useSocket } from '@/lib/socket/context';
import { SearchBar } from './SearchBar';
import { useSearch } from '@/lib/hooks/useSearch';
import { UserList } from './UserList';
import { useUsers } from '@/lib/users/context';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { MessageComponent } from './Message';
import { ChatSection } from './ChatSection';

const firaCode = Fira_Code({ subsets: ['latin'] });

export function HomeUI() {
  const { userName, userId, userImageUrl } = useAuthContext();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
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

  const { users, isLoading: isLoadingUsers } = useUsers();
  const [isUserListCollapsed, setIsUserListCollapsed] = useLocalStorage('userListCollapsed', false);
  const [isChatSectionCollapsed, setIsChatSectionCollapsed] = useLocalStorage('chatSectionCollapsed', true);

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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !newMessage.trim() || !isConnected) return;

    const messageId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      id: messageId,
      content: newMessage,
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
    setNewMessage('');
    setReplyTo(null);
    sendSocketMessage(messageId, selectedChannel, newMessage, undefined, replyTo?.id);
  };

  const handleReply = (message: Message) => {
    setReplyTo(message);
    messageInputRef.current?.focus();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannel || !isConnected) return;

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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
  const handleSelectChannel = (channelId: string | null) => {
    setSelectedChannel(channelId);
    setCurrentChannel(channelId);
  };

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
            <UserButton 
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonAvatarBox: 'w-8 h-8',
                  userButtonPopoverCard: 'border border-zinc-700 shadow-xl !bg-zinc-800 !rounded',
                  userButtonPopoverActions: 'border-t border-zinc-700',
                  userPreviewMainIdentifier: '!text-zinc-200 font-mono',
                  userPreviewSecondaryIdentifier: '!text-zinc-400 font-mono',
                  userButtonPopoverActionButton: '!text-zinc-400 hover:!text-zinc-200 font-mono',
                  userButtonPopoverActionButtonText: 'font-mono !text-zinc-200',
                  userButtonPopoverActionButtonIcon: '!text-zinc-400',
                  footerActionLink: '!text-zinc-400 hover:!text-zinc-200',
                  footerActionText: '!text-zinc-200',
                  card: '!rounded',
                  avatarBox: '!rounded',
                  userPreviewAvatarBox: '!rounded',
                  userButtonAvatarImage: '!rounded',
                  organizationSwitcherTriggerIcon: '!text-zinc-200',
                  organizationPreviewTextContainer: '!text-zinc-200',
                  organizationSwitcherTrigger: '!text-zinc-200',
                  organizationSwitcherTriggerButton: '!text-zinc-200',
                  userButtonTrigger: '!text-zinc-200 !rounded focus:!ring-2 focus:!ring-[#00b300] focus:!ring-offset-2 focus:!ring-offset-zinc-800',
                  userButtonPopoverActionButtonArrow: '!text-zinc-200',
                  userButtonPopoverFooter: '!text-zinc-200 border-t border-zinc-700',
                  userPreview: 'flex items-center pb-4',
                  userPreviewTextContainer: 'flex flex-col justify-center'
                }
              }}
            />
          </div>
        </div>
        
        {/* Channel list */}
        {isLoading ? (
          <div className={`${firaCode.className} text-sm text-zinc-400`}>Loading channels...</div>
        ) : (
          <ChannelList
            channels={channels}
            selectedChannel={selectedChannel}
            onSelectChannel={handleSelectChannel}
            onChannelCreated={(newChannel) => {
              setChannels(prev => {
                // First remove any existing channel with this ID or matching originalId
                const withoutNew = prev.filter(channel => 
                  channel.id !== newChannel.id && 
                  channel.id !== newChannel.originalId
                );
                
                if ('_remove' in newChannel) {
                  // If removing, just return the filtered list
                  if (selectedChannel === newChannel.id) {
                    setSelectedChannel(null);
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
            onChannelDeleted={(deletedChannelId) => {
              // Remove the deleted channel and all its children
              setChannels(prev => {
                const isChildOf = (channelId: string, parentId: string): boolean => {
                  const channel = prev.find(c => c.id === channelId);
                  if (!channel) return false;
                  if (channel.parentId === parentId) return true;
                  return channel.parentId ? isChildOf(channel.parentId, parentId) : false;
                };

                // Filter out the deleted channel and all its descendants
                const remainingChannels = prev.filter(channel => 
                  channel.id !== deletedChannelId && !isChildOf(channel.id, deletedChannelId)
                );

                return remainingChannels;
              });

              // If we're in the deleted channel or any of its children, return to channel select
              const isInDeletedChannel = (channelId: string): boolean => {
                const channel = channels.find(c => c.id === channelId);
                if (!channel) return false;
                if (channel.id === deletedChannelId) return true;
                return channel.parentId ? isInDeletedChannel(channel.parentId) : false;
              };

              if (selectedChannel && isInDeletedChannel(selectedChannel)) {
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
            }}
            className="flex-1"
          />
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
                  <div key={selectedChannel}>
                    {messages.map(message => (
                      <MessageComponent
                        key={message.id}
                        message={message}
                        isHighlighted={message.id === selectedMessageId}
                        onReply={handleReply}
                        onHighlightMessage={setSelectedMessageId}
                        onSelectChannel={handleSelectChannel}
                        onChannelCreated={(newChannel) => {
                          setChannels(prev => {
                            // First remove any existing channel with this ID or matching originalId
                            const withoutNew = prev.filter(channel => 
                              channel.id !== newChannel.id && 
                              channel.id !== newChannel.originalId
                            );
                            
                            if ('_remove' in newChannel) {
                              // If removing, just return the filtered list
                              if (selectedChannel === newChannel.id) {
                                setSelectedChannel(null);
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

            {/* Message input */}
            <div className="border-t border-zinc-800">
              <form onSubmit={sendMessage} className="p-4">
                <div className="relative flex flex-col gap-2">
                  {replyTo && (
                    <div className={`${firaCode.className} flex items-center gap-1 px-2 py-0.5 text-[14px] rounded bg-zinc-800/50`}>
                      <span className="text-zinc-400">replying.to</span>
                      <span className="text-[#00b300]">{replyTo.author.name}</span>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
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
                          setReplyTo(null);
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
                        onChange={handleFileSelect}
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
          </>
        ) : (
          <div className={`${firaCode.className} text-sm flex-1 flex items-center justify-center text-zinc-500`}>
            Select a channel to start chatting
          </div>
        )}
      </main>

      {/* Right Sidebar - Users and Chat */}
      <aside className="bg-zinc-800 p-4 flex flex-col">
        {isLoadingUsers ? (
          <div className={`${firaCode.className} text-sm text-zinc-400`}>Loading users...</div>
        ) : (
          <div className="flex flex-col h-full">
            <UserList
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
            {isUserListCollapsed && (
              <div className="flex flex-col items-center gap-4 mt-auto pt-4">
                <button
                  onClick={() => setIsUserListCollapsed(false)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  aria-label="Show users"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </button>
                <button
                  onClick={() => setIsUserListCollapsed(false)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  aria-label="Show chat"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
