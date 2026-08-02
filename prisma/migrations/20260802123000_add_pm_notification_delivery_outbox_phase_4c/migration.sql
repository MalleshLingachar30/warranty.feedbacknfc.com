CREATE TYPE "PreventiveMaintenanceNotificationDeliveryChannel" AS ENUM (
  'email',
  'sms'
);

CREATE TYPE "PreventiveMaintenanceNotificationDeliveryStatus" AS ENUM (
  'queued',
  'sending',
  'sent',
  'failed',
  'skipped'
);

CREATE TABLE "preventive_maintenance_notification_delivery_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_intent_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "channel" "PreventiveMaintenanceNotificationDeliveryChannel" NOT NULL,
  "status" "PreventiveMaintenanceNotificationDeliveryStatus" NOT NULL DEFAULT 'queued',
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "recipient_address" VARCHAR(255),
  "provider_message_id" VARCHAR(255),
  "provider_response" JSONB,
  "error_message" TEXT,
  "skip_reason" VARCHAR(120),
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "dedupe_key" VARCHAR(260) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preventive_maintenance_notification_delivery_attempts_dedupe_key_key"
  ON "preventive_maintenance_notification_delivery_attempts"("dedupe_key");

CREATE INDEX "idx_pm_delivery_attempts_intent"
  ON "preventive_maintenance_notification_delivery_attempts"("notification_intent_id", "created_at");

CREATE INDEX "idx_pm_delivery_attempts_org_status"
  ON "preventive_maintenance_notification_delivery_attempts"("organization_id", "status", "created_at");

CREATE INDEX "idx_pm_delivery_attempts_channel_status"
  ON "preventive_maintenance_notification_delivery_attempts"("channel", "status", "created_at");

ALTER TABLE "preventive_maintenance_notification_delivery_attempts"
  ADD CONSTRAINT "preventive_maintenance_notification_delivery_attempts_notification_intent_id_fkey"
  FOREIGN KEY ("notification_intent_id") REFERENCES "preventive_maintenance_notification_intents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
