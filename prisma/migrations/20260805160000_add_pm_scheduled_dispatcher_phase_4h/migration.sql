ALTER TYPE "PreventiveMaintenanceNotificationDeliveryStatus"
  ADD VALUE IF NOT EXISTS 'dead_letter';

ALTER TYPE "PreventiveMaintenanceNotificationAuditOperation"
  ADD VALUE IF NOT EXISTS 'scheduled_dispatch';

ALTER TYPE "PreventiveMaintenanceNotificationAuditOperation"
  ADD VALUE IF NOT EXISTS 'scheduled_delivery_attempt';

CREATE TYPE "PreventiveMaintenanceNotificationScheduledRunStatus" AS ENUM (
  'running',
  'succeeded',
  'completed_with_failures',
  'failed'
);

ALTER TABLE "preventive_maintenance_notification_audit_logs"
  DROP CONSTRAINT "preventive_maintenance_notification_audit_logs_actor_user_id_fkey";

ALTER TABLE "preventive_maintenance_notification_audit_logs"
  ALTER COLUMN "actor_user_id" DROP NOT NULL;

ALTER TABLE "preventive_maintenance_notification_audit_logs"
  ADD CONSTRAINT "preventive_maintenance_notification_audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "preventive_maintenance_notification_scheduled_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_key" VARCHAR(160) NOT NULL,
  "status" "PreventiveMaintenanceNotificationScheduledRunStatus" NOT NULL DEFAULT 'running',
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "requested_live_delivery" BOOLEAN NOT NULL DEFAULT false,
  "schedule_window_started_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "scanned_intent_count" INTEGER NOT NULL DEFAULT 0,
  "candidate_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "existing_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "provider_call_count" INTEGER NOT NULL DEFAULT 0,
  "retried_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "deferred_retry_count" INTEGER NOT NULL DEFAULT 0,
  "dead_lettered_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "preference_suppressed_count" INTEGER NOT NULL DEFAULT 0,
  "suppression_reason_counts" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "error_message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_scheduled_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preventive_maintenance_notification_scheduled_runs_run_key_key"
  ON "preventive_maintenance_notification_scheduled_runs"("run_key");

CREATE INDEX "idx_pm_scheduled_runs_status_started"
  ON "preventive_maintenance_notification_scheduled_runs"("status", "started_at");

CREATE INDEX "idx_pm_scheduled_runs_window"
  ON "preventive_maintenance_notification_scheduled_runs"("schedule_window_started_at");

CREATE TABLE "preventive_maintenance_notification_scheduler_leases" (
  "id" VARCHAR(80) NOT NULL,
  "claim_token" VARCHAR(80) NOT NULL,
  "run_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_notification_scheduler_leases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_pm_scheduler_leases_expiry"
  ON "preventive_maintenance_notification_scheduler_leases"("expires_at");

ALTER TABLE "preventive_maintenance_notification_delivery_attempts"
  ADD COLUMN "claim_token" VARCHAR(80),
  ADD COLUMN "claimed_at" TIMESTAMP(3),
  ADD COLUMN "claim_expires_at" TIMESTAMP(3),
  ADD COLUMN "next_retry_at" TIMESTAMP(3),
  ADD COLUMN "dead_lettered_at" TIMESTAMP(3),
  ADD COLUMN "scheduled_run_id" UUID;

CREATE INDEX "idx_pm_delivery_attempts_retry"
  ON "preventive_maintenance_notification_delivery_attempts"("status", "next_retry_at", "created_at");

CREATE INDEX "idx_pm_delivery_attempts_claim_expiry"
  ON "preventive_maintenance_notification_delivery_attempts"("status", "claim_expires_at");

CREATE INDEX "idx_pm_delivery_attempts_scheduled_run"
  ON "preventive_maintenance_notification_delivery_attempts"("scheduled_run_id", "status");

ALTER TABLE "preventive_maintenance_notification_delivery_attempts"
  ADD CONSTRAINT "preventive_maintenance_notification_delivery_attempts_scheduled_run_id_fkey"
  FOREIGN KEY ("scheduled_run_id")
  REFERENCES "preventive_maintenance_notification_scheduled_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
