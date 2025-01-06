import { ClerkProvider } from '@clerk/nextjs';
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
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
