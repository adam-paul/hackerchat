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
