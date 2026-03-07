ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "customer_phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "activated_via" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "activated_at_location" VARCHAR(255);

ALTER TABLE "sticker_allocations"
ADD COLUMN IF NOT EXISTS "include_carton_qr" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "otp_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "product_id" UUID NOT NULL,
    "purpose" VARCHAR(30) NOT NULL,
    "otp_code" VARCHAR(6) NOT NULL,
    "otp_expires_at" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "session_token" VARCHAR(255),
    "session_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "otp_sessions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "otp_sessions_session_token_key"
ON "otp_sessions"("session_token");

CREATE INDEX IF NOT EXISTS "idx_otp_sessions_phone_product"
ON "otp_sessions"("phone", "product_id");

CREATE TABLE IF NOT EXISTS "scan_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sticker_number" INTEGER NOT NULL,
    "product_id" UUID,
    "scan_source" VARCHAR(10),
    "scan_context" VARCHAR(20),
    "viewer_type" VARCHAR(30) NOT NULL,
    "user_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "action_taken" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scan_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "scan_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_scan_log_sticker"
ON "scan_log"("sticker_number", "created_at");
