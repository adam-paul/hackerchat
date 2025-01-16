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
