// src/app/api/channels/[channelId]/messages/route.ts

import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUser } from '@/lib/db/user';
import type { Message } from "@/types";

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
        channelId: params.channelId,
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
        createdAt: "asc"
      },
      take: 50
    });

    const formattedMessages = messages.map(msg => ({
      ...msg,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error("[MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    await getOrCreateUser();

    const { content, fileUrl, fileName, fileType, fileSize } = await req.json();

    if (!content) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const channel = await prisma.channel.findFirst({
      where: {
        id: params.channelId,
      }
    });

    if (!channel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const dbMessage = await prisma.message.create({
      data: {
        content,
        fileUrl,
        fileName,
        fileType,
        fileSize,
        channelId: params.channelId,
        authorId: userId
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            imageUrl: true
          }
        }
      }
    });

    const message: Message = {
      ...dbMessage,
      createdAt: dbMessage.createdAt.toISOString(),
      fileUrl: dbMessage.fileUrl ?? undefined,
      fileName: dbMessage.fileName ?? undefined,
      fileType: dbMessage.fileType ?? undefined,
      fileSize: dbMessage.fileSize ?? undefined
    };

    return NextResponse.json(message);
  } catch (error) {
    console.error("[MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
