// src/components/ui/SearchBar.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import { Message } from '@/types';
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface SearchBarProps {
  messages: Message[];
  onResultClick: (messageId: string) => void;
  selectedMessageId: string | null;
}

export function SearchBar({ 
  messages,
  onResultClick,
  selectedMessageId
}: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevSelectedMessageIdRef = useRef<string | null>(selectedMessageId);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const results = messages.filter(message => 
      message.content.toLowerCase().includes(query.toLowerCase())
    );
    
    setSearchResults(results.slice(0, 3));
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        clearSearch();
      }
    }

    function handleEscKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        clearSearch();
        inputRef.current?.blur();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [clearSearch]);

  useEffect(() => {
    if (prevSelectedMessageIdRef.current && !selectedMessageId) {
      clearSearch();
    }
    prevSelectedMessageIdRef.current = selectedMessageId;
  }, [selectedMessageId, clearSearch]);

  const handleResultClick = (messageId: string) => {
    onResultClick(messageId);
  };

  return (
    <div className="relative">
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search messages..."
          className={`${firaCode.className} w-48 px-3 py-2 text-sm bg-zinc-800 text-zinc-200 rounded focus:outline-none focus:ring-2 focus:ring-[#00b300]`}
        />
      </div>

      {searchResults.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-1 w-64 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded shadow-lg"
        >
          {searchResults.map((result) => (
            <button
              key={result.id}
              onClick={() => handleResultClick(result.id)}
              className="w-full px-4 py-2 text-left hover:bg-zinc-700 text-zinc-200 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium truncate">{result.content}</span>
                <span className="text-xs text-zinc-400">
                  {result.author.name || 'Unknown user'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
} 
