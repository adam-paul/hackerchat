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
    // First delete all messages in the channel
    await prisma.message.deleteMany({
      where: {
        channelId: params.channelId,
      },
    });

    // Then delete the channel
    const channel = await prisma.channel.delete({
      where: {
        id: params.channelId,
      },
    });

    return NextResponse.json(channel);
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