// src/app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth/context';
import { SocketProvider } from '@/lib/socket/context';
import { IdleManager } from '@/components/ui/IdleManager';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// 1 minute in milliseconds for testing (originally 30 minutes)
const IDLE_TIMEOUT = 1 * 60 * 1000;

export const metadata: Metadata = {
  title: 'HackerChat',
  description: 'A real-time chat application with a hacker aesthetic',
};

// Simple debug component for testing idle timer
function IdleDebug() {
  'use client';
  const simulateIdle = () => {
    // Create a global function that the dev tools can access
    (window as any).simulateIdleActivity = () => {
      console.log('[DEBUG] Simulating idle activity - no activity will be detected for 2 minutes');
      
      // Override all event listeners temporarily
      const originalAddEventListener = window.addEventListener;
      window.addEventListener = function(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
        console.log(`[DEBUG] Blocked event listener registration: ${type}`);
        return undefined as any;
      };
      
      // After 2 minutes, restore the normal behavior
      setTimeout(() => {
        window.addEventListener = originalAddEventListener;
        console.log('[DEBUG] Restored event listeners after simulated idle period');
      }, 120000);
    };
    
    console.log('[DEBUG] IdleDebug tool activated. Run window.simulateIdleActivity() in console to test');
    alert('Debug mode activated. Open the console and run window.simulateIdleActivity() to simulate being idle');
  };
  
  return process.env.NODE_ENV === 'development' ? (
    <div style={{ position: 'fixed', bottom: 10, right: 10, zIndex: 9999 }}>
      <button
        onClick={simulateIdle}
        style={{ 
          background: '#333', 
          color: '#ff5', 
          border: '1px solid #ff5',
          padding: '5px 10px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        Debug Idle
      </button>
    </div>
  ) : null;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="preload"
          href="https://i.imgur.com/SEE4F4k.gif"
          as="image"
          type="image/gif"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${inter.className} bg-zinc-900 text-zinc-100`}>
        <ClerkProvider>
          <AuthProvider>
            <SocketProvider>
              <IdleManager idleTimeout={IDLE_TIMEOUT} />
              {children}
              <IdleDebug />
            </SocketProvider>
          </AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
