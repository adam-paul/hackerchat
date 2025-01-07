// src/app/layout.tsx

import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth/context';
import './globals.css';

export const metadata = {
  title: 'ChatGenius',
  description: 'A modern real-time chat application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-zinc-900">
          <AuthProvider>
            {children}
          </AuthProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
