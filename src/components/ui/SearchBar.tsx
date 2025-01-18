// src/components/ui/SearchBar.tsx

import { useEffect, useRef } from 'react';
import { Message } from '@/types';
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: Message[];
  onResultClick: (messageId: string) => void;
  onClear: () => void;
  selectedMessageId: string | null;
}

export function SearchBar({ 
  searchQuery, 
  onSearchChange, 
  searchResults, 
  onResultClick,
  onClear,
  selectedMessageId
}: SearchBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClear();
      }
    }

    function handleEscKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClear();
        inputRef.current?.blur();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClear]);

  useEffect(() => {
    if (!selectedMessageId && searchQuery) {
      onClear();
    }
  }, [selectedMessageId, searchQuery, onClear]);

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
          onChange={(e) => onSearchChange(e.target.value)}
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
