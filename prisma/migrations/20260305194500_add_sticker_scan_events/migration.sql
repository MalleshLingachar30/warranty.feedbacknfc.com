-- CreateEnum
CREATE TYPE "StickerScanSource" AS ENUM ('qr', 'nfc', 'unknown');

-- CreateTable
CREATE TABLE "sticker_scan_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sticker_id" UUID NOT NULL,
    "sticker_number" INTEGER NOT NULL,
    "organization_id" UUID,
    "source" "StickerScanSource" NOT NULL DEFAULT 'unknown',
    "user_agent" TEXT,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sticker_scans_org_time" ON "sticker_scan_events"("organization_id", "scanned_at");

-- CreateIndex
CREATE INDEX "idx_sticker_scans_sticker_time" ON "sticker_scan_events"("sticker_id", "scanned_at");

-- CreateIndex
CREATE INDEX "idx_sticker_scans_number" ON "sticker_scan_events"("sticker_number");

