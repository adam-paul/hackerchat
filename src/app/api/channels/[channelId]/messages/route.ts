// src/app/api/channels/[channelId]/messages/route.ts

import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const messages = await prisma.message.findMany({
      where: { 
        channelId: params.channelId 
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            imageUrl: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 50 // Limit to last 50 messages
    });

    const formattedMessages = messages.map(message => ({
      id: message.id,
      content: message.content,
      channelId: message.channelId,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileType: message.fileType,
      fileSize: message.fileSize,
      createdAt: message.createdAt.toISOString(),
      author: {
        id: message.author.id,
        name: message.author.name,
        imageUrl: message.author.imageUrl
      }
    }));

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error("[MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 