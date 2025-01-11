import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db/prisma';
import { NextResponse } from 'next/server';
import { io } from 'socket.io-client';

// Webhook secret from environment variable
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
const socketSecret = process.env.SOCKET_WEBHOOK_SECRET;

async function broadcastStatusChange(userId: string, status: 'offline') {
  console.log('Starting broadcastStatusChange for user:', userId);
  console.log('Socket URL:', socketUrl);
  console.log('Socket webhook secret present:', !!socketSecret);

  return new Promise<void>((resolve, reject) => {
    try {
      console.log('Creating socket connection...');
      const socket = io(socketUrl, {
        auth: {
          token: socketSecret,
          type: 'webhook'
        }
      });

      socket.on('connect', () => {
        console.log('Socket connected successfully');
        socket.emit('status-update', status);
        console.log('Emitted status-update event:', status);
        
        // Wait briefly to ensure event is sent
        setTimeout(() => {
          console.log('Disconnecting socket after successful emit');
          socket.disconnect();
          resolve();
        }, 1000);
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        socket.disconnect();
        reject(error);
      });

      // Set a timeout for the entire operation
      setTimeout(() => {
        console.log('Socket operation timed out');
        socket.disconnect();
        reject(new Error('Socket broadcast timeout'));
      }, 5000);
    } catch (error) {
      console.error('Error in broadcastStatusChange:', error);
      reject(error);
    }
  });
}

export async function POST(req: Request) {
  console.log('Webhook received - starting processing');
  
  // Verify webhook signature
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  console.log('Webhook headers:', {
    svix_id,
    svix_timestamp,
    svix_signature: svix_signature ? 'present' : 'missing'
  });

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.log('Missing required Svix headers');
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  console.log('Webhook payload:', JSON.stringify(payload, null, 2));
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret
  const wh = new Webhook(webhookSecret || "");
  console.log('Webhook secret present:', !!webhookSecret);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
    console.log('Webhook verification successful');
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new NextResponse('Error verifying webhook', { status: 400 });
  }

  console.log('Received webhook event:', {
    type: evt.type,
    data: evt.data
  });

  // Handle both session.ended and session.removed events
  if (evt.type === 'session.ended' || evt.type === 'session.removed') {
    const { user_id } = evt.data;
    console.log('Processing session end for user:', user_id);
    
    try {
      // Update user status to offline in database
      const updatedUser = await prisma.user.update({
        where: { id: user_id },
        data: { 
          status: 'offline',
          updatedAt: new Date()
        }
      });
      console.log('Updated user status in database:', updatedUser);

      // Try to broadcast the status change
      try {
        await broadcastStatusChange(user_id, 'offline');
        console.log('Successfully broadcast status change');
      } catch (error) {
        // Log but don't fail the webhook if broadcast fails
        console.error('Failed to broadcast status change:', error);
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating user status:', error);
      return new NextResponse('Error updating user status', { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
} 