import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 10;

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

function collectPhotoFiles(formData: FormData): File[] {
  const photos = [
    ...formData.getAll("photo"),
    ...formData.getAll("photos"),
    ...formData.getAll("file"),
  ];

  return photos.filter((entry): entry is File => entry instanceof File);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Use multipart/form-data with image files in 'photo' or 'photos' fields.",
        },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const files = collectPhotoFiles(formData);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Photo file is required." },
        { status: 400 },
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Upload up to ${MAX_FILES} photos per request.` },
        { status: 400 },
      );
    }

    const uploaded = await Promise.all(
      files.map(async (file) => {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`'${file.name}' exceeds 8MB size limit.`);
        }

        const mimeType = file.type || "image/jpeg";

        if (!isImageMimeType(mimeType)) {
          throw new Error(`'${file.name}' is not a supported image type.`);
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");

        return {
          fileName: file.name,
          mimeType,
          size: file.size,
          url: `data:${mimeType};base64,${base64}`,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      count: uploaded.length,
      url: uploaded[0]?.url ?? null,
      urls: uploaded.map((item) => item.url),
      files: uploaded,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload photo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
