import { openDB, type DBSchema } from "idb";

import { uploadPhotoEntries } from "@/lib/photo-upload";

export type QueuedPhotoStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "failed";

export interface QueuedPhotoRecord {
  id: string;
  ownerId: string;
  slot: string;
  fileName: string;
  blob: Blob;
  capturedAt: string;
  uploadStatus: QueuedPhotoStatus;
  uploadAttempts: number;
  lastAttemptAt: string | null;
  uploadedUrl: string | null;
}

export interface QueueStatusSummary {
  pending: number;
  uploading: number;
  uploaded: number;
  failed: number;
}

interface PhotoQueueDB extends DBSchema {
  "pending-photos": {
    key: string;
    value: QueuedPhotoRecord;
    indexes: {
      "by-owner": [string, string];
      "by-status": QueuedPhotoStatus;
    };
  };
}

interface ProcessUploadQueueResult {
  uploadedCount: number;
  failedCount: number;
  pendingCount: number;
}

type SubmissionStatus = "ready" | "offline" | "pending" | "failed";

interface PrepareQueuedPhotosResult {
  status: SubmissionStatus;
  urls: string[];
  count: number;
}

const DB_NAME = "warranty-photo-queue";
const STORE_NAME = "pending-photos";
const DB_VERSION = 1;
const MAX_UPLOAD_ATTEMPTS = 3;
const CHANGE_EVENT = "warranty-photo-queue:changed";

let activeProcess:
  | Promise<ProcessUploadQueueResult>
  | null = null;

function emitQueueChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

async function getDB() {
  return openDB<PhotoQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const store = database.createObjectStore(STORE_NAME, {
        keyPath: "id",
      });
      store.createIndex("by-owner", ["ownerId", "slot"]);
      store.createIndex("by-status", "uploadStatus");
    },
  });
}

function asSortedQueue(records: QueuedPhotoRecord[]) {
  return [...records].sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );
}

function createQueuedRecord(
  ownerId: string,
  slot: string,
  file: File,
): QueuedPhotoRecord {
  return {
    id: crypto.randomUUID(),
    ownerId,
    slot,
    fileName: file.name,
    blob: file,
    capturedAt: new Date().toISOString(),
    uploadStatus: "pending",
    uploadAttempts: 0,
    lastAttemptAt: null,
    uploadedUrl: null,
  };
}

export function subscribeToPhotoQueue(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => {
    listener();
  };

  window.addEventListener(CHANGE_EVENT, handler);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}

export async function queueFilesForOwner(input: {
  ownerId: string;
  slot: string;
  files: File[];
}) {
  if (input.files.length === 0) {
    return [];
  }

  const db = await getDB();
  const records = input.files.map((file) =>
    createQueuedRecord(input.ownerId, input.slot, file),
  );
  const transaction = db.transaction(STORE_NAME, "readwrite");

  await Promise.all(records.map((record) => transaction.store.put(record)));
  await transaction.done;

  emitQueueChange();

  return records;
}

export async function listPhotosForOwner(ownerId: string, slot: string) {
  const db = await getDB();
  const records = await db.getAllFromIndex(
    STORE_NAME,
    "by-owner",
    [ownerId, slot],
  );
  return asSortedQueue(records);
}

export async function deleteQueuedPhotos(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  const db = await getDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");

  await Promise.all(ids.map((id) => transaction.store.delete(id)));
  await transaction.done;

  emitQueueChange();
}

export async function deletePhotosForOwner(ownerId: string, slot: string) {
  const existing = await listPhotosForOwner(ownerId, slot);
  await deleteQueuedPhotos(existing.map((record) => record.id));
}

export async function getQueueStatus(): Promise<QueueStatusSummary> {
  const db = await getDB();
  const records = await db.getAll(STORE_NAME);

  return {
    pending: records.filter((record) => record.uploadStatus === "pending").length,
    uploading: records.filter((record) => record.uploadStatus === "uploading")
      .length,
    uploaded: records.filter((record) => record.uploadStatus === "uploaded").length,
    failed: records.filter((record) => record.uploadStatus === "failed").length,
  };
}

async function uploadQueuedPhoto(record: QueuedPhotoRecord) {
  const [uploadedUrl] = await uploadPhotoEntries([
    {
      blob: record.blob,
      fileName: record.fileName,
    },
  ]);

  if (!uploadedUrl) {
    throw new Error("Queued upload did not return a photo URL.");
  }

  return uploadedUrl;
}

export async function processUploadQueue(): Promise<ProcessUploadQueueResult> {
  if (activeProcess) {
    return activeProcess;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      uploadedCount: 0,
      failedCount: 0,
      pendingCount: (await getQueueStatus()).pending,
    };
  }

  activeProcess = (async () => {
    const db = await getDB();
    const records = await db.getAll(STORE_NAME);
    const queued = asSortedQueue(
      records.filter(
        (record) =>
          record.uploadStatus === "pending" ||
          record.uploadStatus === "uploading",
      ),
    );

    let uploadedCount = 0;
    let failedCount = 0;

    for (const record of queued) {
      const uploadingRecord: QueuedPhotoRecord = {
        ...record,
        uploadStatus: "uploading",
        uploadAttempts: record.uploadAttempts + 1,
        lastAttemptAt: new Date().toISOString(),
      };

      await db.put(STORE_NAME, uploadingRecord);
      emitQueueChange();

      try {
        const uploadedUrl = await uploadQueuedPhoto(uploadingRecord);

        await db.put(STORE_NAME, {
          ...uploadingRecord,
          uploadStatus: "uploaded",
          uploadedUrl,
        });

        uploadedCount += 1;
      } catch (error) {
        const shouldFail =
          uploadingRecord.uploadAttempts >= MAX_UPLOAD_ATTEMPTS;

        await db.put(STORE_NAME, {
          ...uploadingRecord,
          uploadStatus: shouldFail ? "failed" : "pending",
        });

        if (shouldFail) {
          failedCount += 1;
        }

        console.error("Queued photo upload failed", error);
      }

      emitQueueChange();
    }

    const summary = await getQueueStatus();

    return {
      uploadedCount,
      failedCount,
      pendingCount: summary.pending + summary.uploading,
    };
  })().finally(() => {
    activeProcess = null;
  });

  return activeProcess;
}

export async function prepareQueuedPhotosForSubmission(
  ownerId: string,
  slot: string,
): Promise<PrepareQueuedPhotosResult> {
  const existing = await listPhotosForOwner(ownerId, slot);

  if (existing.length === 0) {
    return {
      status: "ready",
      urls: [],
      count: 0,
    };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      status: "offline",
      urls: [],
      count: existing.length,
    };
  }

  await processUploadQueue();

  const refreshed = await listPhotosForOwner(ownerId, slot);
  const uploadedUrls = refreshed
    .map((record) => record.uploadedUrl)
    .filter((entry): entry is string => typeof entry === "string");

  const pendingCount = refreshed.filter(
    (record) =>
      record.uploadStatus === "pending" || record.uploadStatus === "uploading",
  ).length;

  if (pendingCount > 0) {
    return {
      status: "pending",
      urls: uploadedUrls,
      count: pendingCount,
    };
  }

  const failedCount = refreshed.filter(
    (record) => record.uploadStatus === "failed",
  ).length;

  if (failedCount > 0) {
    return {
      status: "failed",
      urls: uploadedUrls,
      count: failedCount,
    };
  }

  return {
    status: "ready",
    urls: uploadedUrls,
    count: uploadedUrls.length,
  };
}
