CREATE TYPE "PreventiveMaintenanceNotificationTrigger" AS ENUM (
  'scheduled',
  'reassigned',
  'started',
  'completed',
  'cancelled'
);

CREATE TYPE "PreventiveMaintenanceNotificationRecipientRole" AS ENUM (
  'manufacturer',
  'service_center',
  'technician',
  'customer'
);

CREATE TYPE "PreventiveMaintenanceNotificationChannel" AS ENUM (
  'in_app'
);

CREATE TYPE "PreventiveMaintenanceNotificationStatus" AS ENUM (
  'pending',
  'delivered',
  'dismissed',
  'cancelled'
);

CREATE TABLE "preventive_maintenance_notification_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "trigger_type" "PreventiveMaintenanceNotificationTrigger" NOT NULL,
  "recipient_role" "PreventiveMaintenanceNotificationRecipientRole" NOT NULL,
  "channel" "PreventiveMaintenanceNotificationChannel" NOT NULL DEFAULT 'in_app',
  "status" "PreventiveMaintenanceNotificationStatus" NOT NULL DEFAULT 'pending',
  "recipient_user_id" UUID,
  "recipient_organization_id" UUID,
  "recipient_service_center_id" UUID,
  "recipient_technician_id" UUID,
  "title" VARCHAR(180) NOT NULL,
  "message" TEXT NOT NULL,
  "dedupe_key" VARCHAR(240) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preventive_maintenance_notification_intents_dedupe_key_key"
  ON "preventive_maintenance_notification_intents"("dedupe_key");

CREATE INDEX "idx_pm_notifications_event"
  ON "preventive_maintenance_notification_intents"("event_id", "created_at");

CREATE INDEX "idx_pm_notifications_org_status"
  ON "preventive_maintenance_notification_intents"("organization_id", "status", "created_at");

CREATE INDEX "idx_pm_notifications_user_status"
  ON "preventive_maintenance_notification_intents"("recipient_user_id", "status", "created_at");

CREATE INDEX "idx_pm_notifications_recipient_org_status"
  ON "preventive_maintenance_notification_intents"("recipient_organization_id", "status", "created_at");

CREATE INDEX "idx_pm_notifications_service_center_status"
  ON "preventive_maintenance_notification_intents"("recipient_service_center_id", "status", "created_at");

CREATE INDEX "idx_pm_notifications_technician_status"
  ON "preventive_maintenance_notification_intents"("recipient_technician_id", "status", "created_at");

ALTER TABLE "preventive_maintenance_notification_intents"
  ADD CONSTRAINT "preventive_maintenance_notification_intents_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "preventive_maintenance_events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_notification_intents"
  ADD CONSTRAINT "preventive_maintenance_notification_intents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_notification_intents"
  ADD CONSTRAINT "preventive_maintenance_notification_intents_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
