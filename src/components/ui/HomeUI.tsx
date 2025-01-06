// src/components/ui/HomeUI.tsx
'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState } from 'react';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface Channel {
  id: string;
  name: string;
  description?: string;
  _count: { messages: number };
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
}

export function HomeUI() {
  const { user } = useUser();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Fetch channels
  useEffect(() => {
    fetch('/api/channels')
      .then(res => res.json())
      .then(setChannels)
      .catch(console.error);
  }, []);

  // Fetch messages when channel is selected
  useEffect(() => {
    if (selectedChannel) {
      fetch(`/api/channels/${selectedChannel}/messages`)
        .then(res => res.json())
        .then(setMessages)
        .catch(console.error);
    }
  }, [selectedChannel]);

  // Set up SSE for real-time updates
  useEffect(() => {
    if (!selectedChannel) return;

    const events = new EventSource(`/api/channels/${selectedChannel}/sse`);
    
    events.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        setMessages(prev => [data.message, ...prev]);
      }
    };

    return () => events.close();
  }, [selectedChannel]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !newMessage.trim()) return;

    try {
      const res = await fetch(`/api/channels/${selectedChannel}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage })
      });

      if (res.ok) {
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-800 p-4">
        <div className="flex items-center justify-between mb-6">
          <span className={`${firaCode.className} text-zinc-200 text-lg`}>
            chat_genius
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
        <div className="space-y-2">
          {channels.map(channel => (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={`w-full text-left px-2 py-1 rounded ${
                selectedChannel === channel.id
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-400 hover:bg-zinc-700/50'
              }`}
            >
              # {channel.name}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 bg-zinc-900 flex flex-col">
        {selectedChannel ? (
          <>
            {/* Messages area */}
            <div className="flex-1 p-4 overflow-y-auto flex flex-col-reverse">
              {messages.map(message => (
                <div key={message.id} className="mb-4">
                  <div className="flex items-start">
                    {message.author.imageUrl && (
                      <img
                        src={message.author.imageUrl}
                        alt={message.author.name || 'User'}
                        className="w-8 h-8 rounded-full mr-2"
                      />
                    )}
                    <div>
                      <div className="flex items-baseline">
                        <span className="font-medium text-zinc-200">
                          {message.author.name || 'User'}
                        </span>
                        <span className="ml-2 text-xs text-zinc-500">
                          {new Date(message.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-zinc-300">{message.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Message input */}
            <form onSubmit={sendMessage} className="p-4 border-t border-zinc-800">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="w-full px-4 py-2 rounded bg-zinc-800 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Select a channel to start chatting
          </div>
        )}
      </main>
    </div>
  );
}
