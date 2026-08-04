CREATE TYPE "PreventiveMaintenanceNotificationAuditOperation" AS ENUM (
  'live_dispatch',
  'live_canary'
);

CREATE TYPE "PreventiveMaintenanceNotificationAuditOutcome" AS ENUM (
  'attempted',
  'succeeded',
  'completed_with_failures',
  'rejected',
  'failed'
);

CREATE TABLE "preventive_maintenance_notification_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "actor_user_id" UUID NOT NULL,
  "actor_role" VARCHAR(50) NOT NULL,
  "operation" "PreventiveMaintenanceNotificationAuditOperation" NOT NULL,
  "outcome" "PreventiveMaintenanceNotificationAuditOutcome" NOT NULL DEFAULT 'attempted',
  "channel" "PreventiveMaintenanceNotificationDeliveryChannel" NOT NULL,
  "notification_intent_count" INTEGER NOT NULL DEFAULT 0,
  "delivery_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "provider_call_count" INTEGER NOT NULL DEFAULT 0,
  "recipient_address_masked" VARCHAR(255),
  "provider_message_id" VARCHAR(255),
  "error_message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_pm_notification_audit_org_created"
  ON "preventive_maintenance_notification_audit_logs"("organization_id", "created_at");

CREATE INDEX "idx_pm_notification_audit_actor_created"
  ON "preventive_maintenance_notification_audit_logs"("actor_user_id", "created_at");

CREATE INDEX "idx_pm_notification_audit_operation_outcome"
  ON "preventive_maintenance_notification_audit_logs"("operation", "outcome", "created_at");

ALTER TABLE "preventive_maintenance_notification_audit_logs"
  ADD CONSTRAINT "preventive_maintenance_notification_audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_notification_audit_logs"
  ADD CONSTRAINT "preventive_maintenance_notification_audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
