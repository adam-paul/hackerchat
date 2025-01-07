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
    // First delete all messages in the channel and its threads
    const channelWithThreads = await prisma.channel.findUnique({
      where: { id: params.channelId },
      include: { threads: true }
    });

    if (!channelWithThreads) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    // Delete messages from all threads
    for (const thread of channelWithThreads.threads) {
      await prisma.message.deleteMany({
        where: { channelId: thread.id }
      });
    }

    // Delete messages from the main channel
    await prisma.message.deleteMany({
      where: { channelId: params.channelId }
    });

    // Delete the channel (and its threads due to onDelete: Cascade)
    const channel = await prisma.channel.delete({
      where: { id: params.channelId }
    });

    const formattedChannel = {
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
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