'use client';

import { UserList } from './UserList';

interface UserListContainerProps {
  className?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function UserListContainer({ className, isCollapsed, onToggleCollapse }: UserListContainerProps) {
  return (
    <UserList 
      className={className}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
} 