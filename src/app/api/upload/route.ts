// src/app/api/upload/route.ts

import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { put } from '@vercel/blob';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new NextResponse("No file provided", { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return new NextResponse("File size exceeds 15MB limit", { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(`uploads/${userId}/${Date.now()}-${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    return NextResponse.json({
      url: blob.url,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("[UPLOAD_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 