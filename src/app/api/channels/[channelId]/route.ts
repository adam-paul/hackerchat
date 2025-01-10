// src/app/api/channels/[channelId]/route.ts

import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // Clear thread references and delete channel in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Clear thread references from messages that point to this channel
      await tx.message.updateMany({
        where: { threadId: params.channelId },
        data: { 
          threadId: null,
          threadName: null
        }
      });

      // Delete the channel - cascading deletes will handle messages
      const channel = await tx.channel.delete({
        where: { id: params.channelId }
      });

      return channel;
    });

    const formattedChannel = {
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString()
    };

    return NextResponse.json(formattedChannel);
  } catch (error) {
    console.error("[CHANNEL_DELETE]", error);
    if (error instanceof Error) {
      // Check if it's a Prisma error with a code property
      if (typeof (error as any).code === 'string' && (error as any).code === 'P2025') {
        return new NextResponse("Channel not found", { status: 404 });
      }
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { name } = await req.json();

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    const channel = await prisma.channel.update({
      where: { id: params.channelId },
      data: { name }
    });

    const formattedChannel = {
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    };

    return NextResponse.json(formattedChannel);
  } catch (error) {
    console.error("[CHANNEL_PATCH]", error);
    if (error instanceof Error) {
      // Check if it's a Prisma error with a code property
      if (typeof (error as any).code === 'string' && (error as any).code === 'P2025') {
        return new NextResponse("Channel not found", { status: 404 });
      }
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Internal Error", { status: 500 });
  }
} 