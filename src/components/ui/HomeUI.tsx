// src/components/ui/HomeUI.tsx
'use client';

import { UserButton, useAuth } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChannelList } from './ChannelList';
import { Settings } from './Settings';
import type { Channel, Message } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useMessages } from '@/lib/hooks/useMessage';
import { SearchBar } from './SearchBar';
import { useSearch } from '@/lib/hooks/useSearch';

const firaCode = Fira_Code({ subsets: ['latin'] });

export function HomeUI() {
  const { getToken } = useAuth();
  const { userName, userId } = useAuthContext();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    messages, 
    status: messageStatus, 
    error: messageError,
    startLoading: startLoadingMessages,
    setMessages,
    addMessage,
    updateMessage,
    clearMessages,
    setError: setMessageError
  } = useMessages();

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    selectedMessageId,
    setSelectedMessageId,
    searchMessages,
    clearSearch,
  } = useSearch();

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
        // Sort channels by name, keeping threads under their parent channels
        const sortChannels = (channels: Channel[]) => {
          return channels.sort((a: Channel, b: Channel) => {
            // If both are threads or both are not threads, sort by name
            if ((!a.parentId && !b.parentId) || (a.parentId && b.parentId)) {
              return a.name.localeCompare(b.name);
            }
            // If one is a thread and the other isn't, non-thread comes first
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

  // Fetch messages when channel is selected
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedChannel) {
        clearMessages();
        return;
      }

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
  }, [selectedChannel, clearMessages, startLoadingMessages, setMessages, setMessageError]);

  // Set up Socket.IO connection
  useEffect(() => {
    const connectSocket = async () => {
      const token = await getToken();
      if (!token) return;

      const newSocket = io({
        path: '/api/socket',
        addTrailingSlash: false,
        reconnectionDelay: 1000,
        reconnection: true,
        reconnectionAttempts: 10,
        auth: {
          token
        }
      });

      newSocket.on('connect', () => {
        console.log('Connected to Socket.IO server');
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
      });

      newSocket.on('message', (data) => {
        if (data.channelId === selectedChannel) {
          addMessage(data.message);
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    };

    connectSocket();
  }, [getToken, selectedChannel, addMessage]);

  // Join/Leave channel when selection changes
  useEffect(() => {
    if (!socket) return;

    if (selectedChannel) {
      socket.emit('join-channel', selectedChannel);
    }

    return () => {
      if (selectedChannel) {
        socket.emit('leave-channel', selectedChannel);
      }
    };
  }, [selectedChannel, socket]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !newMessage.trim() || !socket) return;

    // Create optimistic message
    const optimisticMessage = {
      id: Date.now().toString(),
      content: newMessage,
      channelId: selectedChannel,
      createdAt: new Date().toISOString(),
      author: {
        id: userId || 'optimistic',
        name: userName || 'Anonymous',
        imageUrl: ''
      }
    };

    // Optimistically update UI
    addMessage(optimisticMessage);
    setNewMessage('');

    try {
      const res = await fetch(`/api/channels/${selectedChannel}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage })
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }
      
      const actualMessage = await res.json();
      
      // Update the optimistic message with the real one
      updateMessage(optimisticMessage.id, actualMessage);
      
      // Broadcast to other clients
      socket.emit('message', {
        type: 'message',
        channelId: selectedChannel,
        message: actualMessage
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageError(error instanceof Error ? error.message : 'Failed to send message');
      setNewMessage(newMessage);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannel) return;

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

      // Create optimistic message with file
      const optimisticMessage = {
        id: Date.now().toString(),
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
          imageUrl: ''
        }
      };

      // Optimistically update UI
      addMessage(optimisticMessage);

      const res = await fetch(`/api/channels/${selectedChannel}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fileName,
          fileUrl: url,
          fileName,
          fileType,
          fileSize
        })
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }
      
      const actualMessage = await res.json();
      
      // Update the optimistic message with the real one
      updateMessage(optimisticMessage.id, actualMessage);
      
      // Broadcast to other clients
      socket?.emit('message', {
        type: 'message',
        channelId: selectedChannel,
        message: actualMessage
      });
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

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-800 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <span className={`${firaCode.className} text-zinc-200 text-lg`}>
            hacker_chat
          </span>
          <UserButton 
            afterSignOutUrl="/"
            appearance={{
              elements: {
                userButtonAvatarBox: 'w-8 h-8'
              }
            }}
          />
        </div>
        
        {/* Channel list */}
        {isLoading ? (
          <div className={`${firaCode.className} text-sm text-zinc-400`}>Loading channels...</div>
        ) : (
          <ChannelList
            channels={channels}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
            onChannelCreated={(newChannel) => setChannels(prev => 
              [...prev, newChannel].sort((a, b) => a.name.localeCompare(b.name))
            )}
            onChannelDeleted={(deletedChannelId) => {
              setChannels(prev => prev.filter(channel => channel.id !== deletedChannelId));
              if (selectedChannel === deletedChannelId) {
                setSelectedChannel(null);
              }
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
              <h2 className={`${firaCode.className} text-zinc-200 font-normal`}>
                {getChannelPath(selectedChannel)}
              </h2>
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
                      <div
                        key={message.id}
                        id={`message-${message.id}`}
                        className={`mb-4 transition-colors duration-300 rounded-lg p-2 ${
                          message.id === selectedMessageId ? 'bg-zinc-700/30' : ''
                        }`}
                      >
                        <div className="flex items-baseline">
                          <span className={`${firaCode.className} text-sm font-medium text-[#00b300]`}>
                            {message.author.name || 'User'}
                          </span>
                          <span className={`${firaCode.className} ml-2 text-xs text-zinc-500`}>
                            {new Date(message.createdAt).toLocaleString()}
                          </span>
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Message input */}
            <div className="border-t border-zinc-800">
              <form onSubmit={sendMessage} className="p-4">
                <div className="relative flex items-center">
                  <span className={`${firaCode.className} absolute left-3 text-zinc-500`}>{'>'}_</span>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className={`${firaCode.className} text-sm w-full pl-10 pr-12 py-2 rounded bg-zinc-800 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#00b300]`}
                  />
                  <div className="absolute right-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className={`${firaCode.className} text-base text-zinc-400 hover:text-zinc-200 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              </form>
            </div>
          </>
        ) : (
          <div className={`${firaCode.className} text-sm flex-1 flex items-center justify-center text-zinc-500`}>
            Select a channel to start chatting
          </div>
        )}
      </main>
    </div>
  );
}
