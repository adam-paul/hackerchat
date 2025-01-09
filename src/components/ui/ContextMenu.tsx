// src/components/ui/ContextMenu.tsx

import { useEffect, useRef } from 'react';
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({ subsets: ['latin'] });

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={`${firaCode.className} absolute z-50 bg-zinc-800 border border-zinc-700 rounded shadow-lg overflow-hidden`}
      style={{
        left: x,
        top: y,
        minWidth: '150px'
      }}
    >
      {children}
    </div>
  );
}

interface ContextMenuItemProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function ContextMenuItem({ onClick, children, className = '', disabled = false }: ContextMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
} 