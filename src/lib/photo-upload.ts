export interface PhotoUploadEntry {
  blob: Blob;
  fileName: string;
}

interface UploadPhotoResponse {
  error?: string;
  urls?: string[];
  url?: string | null;
}

function readUploadedUrls(payload: UploadPhotoResponse): string[] {
  if (Array.isArray(payload.urls)) {
    return payload.urls.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
  }

  if (typeof payload.url === "string" && payload.url.trim().length > 0) {
    return [payload.url];
  }

  return [];
}

export async function uploadPhotoEntries(
  entries: PhotoUploadEntry[],
): Promise<string[]> {
  if (entries.length === 0) {
    return [];
  }

  const formData = new FormData();

  for (const entry of entries) {
    formData.append("photos", entry.blob, entry.fileName);
  }

  const response = await fetch("/api/upload/photo", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as UploadPhotoResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to upload photos.");
  }

  return readUploadedUrls(payload);
}

export async function uploadPhotoFiles(files: File[]): Promise<string[]> {
  return uploadPhotoEntries(
    files.map((file) => ({
      blob: file,
      fileName: file.name,
    })),
  );
}
