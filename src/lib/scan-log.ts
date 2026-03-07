import "server-only";

import { db } from "@/lib/db";

type ScanViewerType =
  | "owner_verified"
  | "owner_session"
  | "public"
  | "technician"
  | "admin"
  | "salesman_assisted";

type ScanAction =
  | "view_only"
  | "view_full"
  | "view_activation"
  | "view_work_order"
  | "activated"
  | "reported_issue"
  | "confirmed_resolution"
  | "started_work"
  | "completed_work";

type ScanSource = "qr" | "nfc" | "unknown" | null;
type ScanContext = "carton" | "product" | null;

function normalizeIpAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : null;
}

export async function writeScanLog(input: {
  stickerNumber: number;
  productId?: string | null;
  scanSource?: ScanSource;
  scanContext?: ScanContext;
  viewerType: ScanViewerType;
  userId?: string | null;
  actionTaken?: ScanAction | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  try {
    await db.scanLog.create({
      data: {
        stickerNumber: input.stickerNumber,
        productId: input.productId ?? null,
        scanSource: input.scanSource ?? null,
        scanContext: input.scanContext ?? null,
        viewerType: input.viewerType,
        userId: input.userId ?? null,
        ipAddress: normalizeIpAddress(input.ipAddress ?? null),
        userAgent: input.userAgent ?? null,
        actionTaken: input.actionTaken ?? null,
      },
    });
  } catch (error) {
    console.error("Scan log capture failed", error);
  }
}
