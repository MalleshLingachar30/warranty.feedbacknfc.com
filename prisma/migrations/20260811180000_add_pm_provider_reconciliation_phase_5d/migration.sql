CREATE TYPE "PreventiveMaintenanceNotificationProviderEventStatus" AS ENUM (
  'accepted',
  'sent',
  'delivered',
  'bounced',
  'suppressed',
  'delivery_delayed',
  'complained',
  'failed',
  'unknown'
);

CREATE TYPE "PreventiveMaintenanceNotificationRecipientHygieneStatus" AS ENUM (
  'bounced',
  'suppressed',
  'complained'
);

ALTER TYPE "PreventiveMaintenanceNotificationAuditOperation"
  ADD VALUE IF NOT EXISTS 'provider_reconciliation';

ALTER TABLE "preventive_maintenance_notification_delivery_attempts"
  ADD COLUMN "provider_event_status" "PreventiveMaintenanceNotificationProviderEventStatus",
  ADD COLUMN "provider_event_at" TIMESTAMP(3),
  ADD COLUMN "provider_reconciled_at" TIMESTAMP(3);

UPDATE "preventive_maintenance_notification_delivery_attempts"
SET
  "provider_event_status" = 'accepted',
  "provider_event_at" = "updated_at",
  "provider_reconciled_at" = CURRENT_TIMESTAMP
WHERE
  "status" = 'sent'
  AND "dry_run" = false
  AND "provider_message_id" IS NOT NULL;

CREATE INDEX "idx_pm_delivery_attempts_provider_event"
  ON "preventive_maintenance_notification_delivery_attempts"("provider_event_status", "provider_event_at");

CREATE INDEX "idx_pm_delivery_attempts_provider_message"
  ON "preventive_maintenance_notification_delivery_attempts"("provider_message_id");

CREATE TABLE "preventive_maintenance_notification_recipient_hygiene" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "channel" "PreventiveMaintenanceNotificationDeliveryChannel" NOT NULL,
  "recipient_address_hash" VARCHAR(64) NOT NULL,
  "recipient_address_masked" VARCHAR(255) NOT NULL,
  "status" "PreventiveMaintenanceNotificationRecipientHygieneStatus" NOT NULL,
  "source_attempt_id" UUID,
  "first_seen_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_recipient_hygiene_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pm_recipient_hygiene_org_channel_address_key"
  ON "preventive_maintenance_notification_recipient_hygiene"("organization_id", "channel", "recipient_address_hash");

CREATE INDEX "idx_pm_recipient_hygiene_org_status"
  ON "preventive_maintenance_notification_recipient_hygiene"("organization_id", "status", "last_seen_at");

CREATE INDEX "idx_pm_recipient_hygiene_channel_address"
  ON "preventive_maintenance_notification_recipient_hygiene"("channel", "recipient_address_hash");

ALTER TABLE "preventive_maintenance_notification_recipient_hygiene"
  ADD CONSTRAINT "pm_recipient_hygiene_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_notification_recipient_hygiene"
  ADD CONSTRAINT "pm_recipient_hygiene_source_attempt_id_fkey"
  FOREIGN KEY ("source_attempt_id") REFERENCES "preventive_maintenance_notification_delivery_attempts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
