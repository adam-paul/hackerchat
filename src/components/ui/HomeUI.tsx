'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({ subsets: ['latin'] });

export function HomeUI() {
  const { user } = useUser();
  
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
        
        {/* Channel/DM list will go here */}
        <div className="text-zinc-400">
          <p>Channels and DMs coming soon...</p>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 bg-zinc-900 p-4">
        <div className="text-zinc-200">
          <h1 className={`${firaCode.className} text-xl mb-4`}>
            Welcome, {user?.firstName || 'User'}!
          </h1>
          <p className="text-zinc-400">
            This is where messages will appear...
          </p>
        </div>
      </main>
    </div>
  );
}

