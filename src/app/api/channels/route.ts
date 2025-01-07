// src/app/api/channels/route.ts

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
    const { name, description, parentId } = await req.json();

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    const channel = await prisma.channel.create({
      data: {
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

    const formattedChannel = {
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    };

    return NextResponse.json(formattedChannel);
  } catch (error) {
    console.error("[CHANNELS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
