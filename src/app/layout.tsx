// src/app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth/context';
import { SocketProvider } from '@/lib/socket/context';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HackerChat',
  description: 'A real-time chat application with a hacker aesthetic',
};

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
              {children}
            </SocketProvider>
          </AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
