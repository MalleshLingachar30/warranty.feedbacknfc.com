ALTER TYPE "PreventiveMaintenanceNotificationAuditOperation"
  ADD VALUE IF NOT EXISTS 'dry_run_dispatch';

ALTER TYPE "PreventiveMaintenanceNotificationAuditOperation"
  ADD VALUE IF NOT EXISTS 'preference_update';

ALTER TABLE "preventive_maintenance_notification_audit_logs"
  ALTER COLUMN "channel" DROP NOT NULL;

CREATE TABLE "preventive_maintenance_notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "recipient_role" "PreventiveMaintenanceNotificationRecipientRole" NOT NULL,
  "email_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pm_notification_preferences_org_role_key"
  ON "preventive_maintenance_notification_preferences"("organization_id", "recipient_role");

CREATE INDEX "idx_pm_notification_preferences_org_updated"
  ON "preventive_maintenance_notification_preferences"("organization_id", "updated_at");

ALTER TABLE "preventive_maintenance_notification_preferences"
  ADD CONSTRAINT "preventive_maintenance_notification_preferences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_notification_preferences"
  ADD CONSTRAINT "preventive_maintenance_notification_preferences_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
