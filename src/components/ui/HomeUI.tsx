// src/components/ui/HomeUI.tsx
'use client';

import { UserButton, useAuth } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChannelList } from './ChannelList';
import { Settings } from './Settings';
import type { Channel, Message } from '@/types';
import { useAuthContext } from '@/lib/auth/context';
import { useMessages } from '@/lib/hooks/useMessage';

const firaCode = Fira_Code({ subsets: ['latin'] });

export function HomeUI() {
  const { getToken } = useAuth();
  const { userName, userId } = useAuthContext();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
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
        setChannels(data.sort((a: Channel, b: Channel) => a.name.localeCompare(b.name)));
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
            <div className="p-4 border-b border-zinc-800">
              <h2 className={`${firaCode.className} text-zinc-200`}>
                #{channels.find(c => c.id === selectedChannel)?.name}
              </h2>
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
                      <div key={message.id} className="mb-4">
                        <div className="flex items-baseline">
                          <span className={`${firaCode.className} text-sm font-medium text-[#00b300]`}>
                            {message.author.name || 'User'}
                          </span>
                          <span className={`${firaCode.className} ml-2 text-xs text-zinc-500`}>
                            {new Date(message.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className={`${firaCode.className} text-sm text-zinc-300`}>
                          {message.content}
                        </p>
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
                    className={`${firaCode.className} text-sm w-full pl-10 pr-4 py-2 rounded bg-zinc-800 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#00b300]`}
                  />
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
