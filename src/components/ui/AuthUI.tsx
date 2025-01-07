// src/components/ui/AuthUI.tsx
'use client';

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Fira_Code } from 'next/font/google';
import { useEffect, useState } from 'react';

const firaCode = Fira_Code({ subsets: ['latin'] });

const buttonClasses = `
  ${firaCode.className}
  rounded border
  border-zinc-700
  bg-zinc-800
  px-6
  py-3
  text-lg
  text-zinc-400
  transition-all
  duration-200
  hover:border-zinc-500
  hover:bg-zinc-700
  hover:text-zinc-200
  focus:outline-none
  focus:ring-2
  focus:ring-zinc-500
  focus:ring-offset-2
  focus:ring-offset-zinc-900
`;

export function AuthUI() {
  const [clerkReady, setClerkReady] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(false);
  
  useEffect(() => {
    // Set a 2 second timeout
    const timer = setTimeout(() => {
      setTimeElapsed(true);
    }, 2000);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement && node.id === 'clerk-components') {
            setClerkReady(true);
            observer.disconnect();
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Clean up both the observer and the timer
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Show loading state if neither condition is met
  if (!clerkReady && !timeElapsed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className={`${firaCode.className} text-4xl text-zinc-300 -translate-y-9 -translate-x-[225px]`}>
          <span className="cursor-animation">_</span>
        </div>
      </main>
    );
  }

  // Rest of the component remains the same...
  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <div className={`${firaCode.className} text-4xl text-zinc-300 mb-8`}>
        <span className="typing-animation">
          welcome to hacker_chat<span className="cursor-animation">_</span>
        </span>
      </div>
      
      <div className="flex space-x-6">
        <SignInButton mode="modal" redirectUrl="/">
          <button className={buttonClasses}>
            sign_in
          </button>
        </SignInButton>
        
        <SignUpButton mode="modal" redirectUrl="/">
          <button className={buttonClasses}>
            sign_up
          </button>
        </SignUpButton>
      </div>
    </main>
  );
}
