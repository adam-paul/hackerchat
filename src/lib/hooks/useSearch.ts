import { useState, useCallback } from 'react';
import type { Message } from '@/types';

export function useSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const searchMessages = useCallback((messages: Message[], query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSelectedMessageId(null);
      return;
    }

    const results = messages.filter(message => 
      message.content.toLowerCase().includes(query.toLowerCase())
    );
    
    setSearchResults(results.slice(0, 3));
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMessageId(null);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    selectedMessageId,
    setSelectedMessageId,
    searchMessages,
    clearSearch,
  };
} 