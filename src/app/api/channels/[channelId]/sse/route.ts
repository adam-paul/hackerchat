// src/app/api/channels/[channelId]/sse/route.ts
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = 'edge';

export async function GET(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const headersList = headers();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('retry: 1000\n\n'));
      
      // Keep connection alive with periodic messages
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
      }, 30000);

      // Clean up on close
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

