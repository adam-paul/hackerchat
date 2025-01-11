import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db/prisma';
import { NextResponse } from 'next/server';
import { io } from 'socket.io-client';

// Webhook secret from environment variable
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export async function POST(req: Request) {
  // Verify webhook signature
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret
  const wh = new Webhook(webhookSecret || "");

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new NextResponse('Error verifying webhook', { status: 400 });
  }

  // Handle session ended event (sign out)
  if (evt.type === 'session.ended') {
    const { user_id } = evt.data;

    try {
      // Update user status to offline in database
      const updatedUser = await prisma.user.update({
        where: { id: user_id },
        data: { status: 'offline' }
      });

      // Connect to socket server to broadcast status change
      const socket = io(socketUrl);
      socket.emit('status-broadcast', {
        userId: user_id,
        status: 'offline',
        timestamp: new Date().toISOString()
      });
      socket.disconnect();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating user status:', error);
      return new NextResponse('Error updating user status', { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
} 