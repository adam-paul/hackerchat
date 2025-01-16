// src/app/api/channels/route.ts

export * from '../route-config';

import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const channels = await prisma.channel.findMany({
      include: {
        _count: {
          select: { messages: true }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const formattedChannels = channels.map(channel => ({
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    }));

    return NextResponse.json(formattedChannels);
  } catch (error) {
    console.error("[CHANNELS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { name, description, parentId, initialMessage, messageId, originalId } = await req.json();

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // Create channel and initial message in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the channel
      const channel = await tx.channel.create({
        data: {
          id: originalId?.startsWith('temp_') ? 
            `channel_${Date.now()}_${Math.random().toString(36).slice(2)}` : 
            originalId || undefined,
          name,
          description,
          parentId,
          creatorId: userId,
        },
        include: {
          _count: {
            select: { messages: true }
          }
        }
      });

      // If this is a thread creation, update the original message
      if (messageId) {
        const messageToUpdate = await tx.message.findFirst({
          where: {
            OR: [
              { id: messageId },
              { originalId: messageId }
            ]
          }
        });

        if (messageToUpdate) {
          await tx.message.update({
            where: { id: messageToUpdate.id },
            data: {
              threadId: channel.id,
              threadName: name
            }
          });
        }
      }

      // If initialMessage is provided, create it
      if (initialMessage) {
        await tx.message.create({
          data: {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            content: initialMessage.content,
            channelId: channel.id,
            authorId: initialMessage.authorId,
            fileUrl: initialMessage.fileUrl,
            fileName: initialMessage.fileName,
            fileType: initialMessage.fileType,
            fileSize: initialMessage.fileSize,
            originalId: initialMessage.originalId
          }
        });
      }

      return channel;
    });

    const formattedChannel = {
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      originalId: originalId?.startsWith('temp_') ? originalId : undefined
    };

    // Broadcast channel creation via socket server
    try {
      await fetch(`${process.env.SOCKET_SERVER_URL}/broadcast/channel-created`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SOCKET_WEBHOOK_SECRET}`
        },
        body: JSON.stringify(formattedChannel)
      });
    } catch (error) {
      console.error("[CHANNELS_POST] Failed to broadcast channel creation:", error);
      // Don't fail the request if broadcast fails
    }

    return NextResponse.json(formattedChannel);
  } catch (error) {
    console.error("[CHANNELS_POST] Error details:", {
      error,
      stack: error instanceof Error ? error.stack : undefined,
      message: error instanceof Error ? error.message : String(error)
    });
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Error", 
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('id');

    if (!channelId) {
      return new NextResponse("Channel ID is required", { status: 400 });
    }

    // Check if user is the creator of the channel
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { creatorId: true }
    });

    if (!channel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    if (channel.creatorId !== userId) {
      return new NextResponse("Unauthorized - Only channel creator can delete", { status: 403 });
    }

    // Delete the channel
    await prisma.channel.delete({
      where: { id: channelId }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[CHANNEL_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
