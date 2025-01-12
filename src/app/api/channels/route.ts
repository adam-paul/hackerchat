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
