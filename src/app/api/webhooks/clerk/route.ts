// src/app/api/webhooks/clerk/route.ts

import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db/prisma';
import { NextResponse } from 'next/server';

// Add basic GET handler for verification
export async function GET() {
  return new NextResponse('Webhook endpoint active', { status: 200 });
}

export async function POST(req: Request) {
  console.log('Webhook received'); // Debug log

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('Missing svix headers'); // Debug log
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  console.log('Webhook payload:', payload); // Debug log

  if (!process.env.CLERK_WEBHOOK_SECRET) {
    console.error('Missing CLERK_WEBHOOK_SECRET'); // Debug log
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Verify with Clerk's webhook secret
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Webhook verification failed:', err); // Debug log
    return new NextResponse('Error verifying webhook', { status: 400 });
  }

  // Handle session events
  if (evt.type === 'session.created') {
    const { user_id } = evt.data;
    
    if (!user_id) {
      console.error('No user_id in webhook data'); // Debug log
      return new NextResponse('Invalid webhook data', { status: 400 });
    }

    try {
      console.log('Updating user status for:', user_id); // Debug log
      
      // Update user status to online in database
      const updatedUser = await prisma.user.update({
        where: { id: user_id },
        data: { 
          status: 'online',
          updatedAt: new Date()
        }
      });

      console.log('User status updated:', updatedUser); // Debug log

      // Broadcast the status change
      if (process.env.SOCKET_SERVER_URL) {
        try {
          const response = await fetch(`${process.env.SOCKET_SERVER_URL}/broadcast-status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SOCKET_WEBHOOK_SECRET}`
            },
            body: JSON.stringify({
              userId: user_id,
              status: 'online'
            })
          });

          if (!response.ok) {
            console.error('Failed to broadcast status:', await response.text());
          }
        } catch (error) {
          console.error('Error broadcasting status:', error);
        }
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating user status:', error); // Debug log
      return new NextResponse('Error updating user status', { status: 500 });
    }
  }

  // Handle session end events
  if (evt.type === 'session.ended' || evt.type === 'session.removed') {
    console.log('Received session end event:', {
      type: evt.type,
      data: evt.data,
      timestamp: new Date().toISOString()
    });
    
    const { user_id } = evt.data;
    
    if (!user_id) {
      console.error('No user_id in webhook data'); // Debug log
      return new NextResponse('Invalid webhook data', { status: 400 });
    }

    try {
      console.log('Updating user status for:', user_id); // Debug log
      
      // Update user status to offline in database
      const updatedUser = await prisma.user.update({
        where: { id: user_id },
        data: { 
          status: 'offline',
          updatedAt: new Date()
        }
      });

      console.log('User status updated:', updatedUser); // Debug log

      // Broadcast the status change
      if (process.env.SOCKET_SERVER_URL) {
        try {
          const response = await fetch(`${process.env.SOCKET_SERVER_URL}/broadcast-status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SOCKET_WEBHOOK_SECRET}`
            },
            body: JSON.stringify({
              userId: user_id,
              status: 'offline'
            })
          });

          if (!response.ok) {
            console.error('Failed to broadcast status:', await response.text());
          }
        } catch (error) {
          console.error('Error broadcasting status:', error);
        }
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating user status:', error); // Debug log
      return new NextResponse('Error updating user status', { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
