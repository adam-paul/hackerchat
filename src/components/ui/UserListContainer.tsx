'use client';

import { UsersProvider } from '@/lib/users/context';
import { UserList } from './UserList';

interface UserListContainerProps {
  className?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function UserListContainer({ className, isCollapsed, onToggleCollapse }: UserListContainerProps) {
  return (
    <UsersProvider>
      <UserList 
        className={className}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </UsersProvider>
  );
} 