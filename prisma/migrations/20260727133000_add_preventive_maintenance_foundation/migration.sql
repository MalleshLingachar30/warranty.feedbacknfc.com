-- Create preventive-maintenance lifecycle enums
CREATE TYPE "PreventiveMaintenanceEventType" AS ENUM (
  'preventive_maintenance',
  'calibration'
);

CREATE TYPE "PreventiveMaintenancePlanStatus" AS ENUM (
  'active',
  'inactive'
);

CREATE TYPE "PreventiveMaintenanceCadenceType" AS ENUM (
  'interval_days',
  'month_offsets',
  'manual'
);

CREATE TYPE "PreventiveMaintenanceEventStatus" AS ENUM (
  'due',
  'scheduled',
  'in_progress',
  'completed',
  'overdue',
  'cancelled'
);

-- Create product-model-level PM plans
CREATE TABLE "preventive_maintenance_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "product_model_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "event_type" "PreventiveMaintenanceEventType" NOT NULL,
  "status" "PreventiveMaintenancePlanStatus" NOT NULL DEFAULT 'active',
  "cadence_type" "PreventiveMaintenanceCadenceType" NOT NULL,
  "cadence_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "due_soon_threshold_days" INTEGER NOT NULL DEFAULT 14,
  "customer_acknowledgement_required" BOOLEAN NOT NULL DEFAULT false,
  "checklist_template" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "calibration_template" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_pm_plans_org_status"
ON "preventive_maintenance_plans"("organization_id", "status");

CREATE INDEX "idx_pm_plans_model_status"
ON "preventive_maintenance_plans"("product_model_id", "status");

-- Create asset-level PM calendar events
CREATE TABLE "preventive_maintenance_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_number" VARCHAR(30) NOT NULL,
  "organization_id" UUID NOT NULL,
  "plan_id" UUID,
  "asset_id" UUID NOT NULL,
  "event_type" "PreventiveMaintenanceEventType" NOT NULL,
  "status" "PreventiveMaintenanceEventStatus" NOT NULL DEFAULT 'due',
  "due_date" TIMESTAMP(3) NOT NULL,
  "scheduled_for" TIMESTAMP(3),
  "assigned_service_center_id" UUID,
  "assigned_technician_id" UUID,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancellation_reason" TEXT,
  "checklist_template_snapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "checklist_responses" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "calibration_template_snapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "calibration_readings" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "remarks" TEXT,
  "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "customer_acknowledgement_required" BOOLEAN NOT NULL DEFAULT false,
  "customer_acknowledged_at" TIMESTAMP(3),
  "customer_acknowledgement_payload" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "preventive_maintenance_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preventive_maintenance_events_event_number_key"
ON "preventive_maintenance_events"("event_number");

CREATE UNIQUE INDEX "pm_events_plan_asset_due_key"
ON "preventive_maintenance_events"("plan_id", "asset_id", "due_date");

CREATE INDEX "idx_pm_events_org_status_due"
ON "preventive_maintenance_events"("organization_id", "status", "due_date");

CREATE INDEX "idx_pm_events_asset_due"
ON "preventive_maintenance_events"("asset_id", "due_date");

CREATE INDEX "idx_pm_events_sc_status_scheduled"
ON "preventive_maintenance_events"("assigned_service_center_id", "status", "scheduled_for");

CREATE INDEX "idx_pm_events_tech_status_scheduled"
ON "preventive_maintenance_events"("assigned_technician_id", "status", "scheduled_for");

CREATE INDEX "idx_pm_events_plan_due"
ON "preventive_maintenance_events"("plan_id", "due_date");

-- Wire PM plan foreign keys
ALTER TABLE "preventive_maintenance_plans"
ADD CONSTRAINT "preventive_maintenance_plans_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_plans"
ADD CONSTRAINT "preventive_maintenance_plans_product_model_id_fkey"
FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_plans"
ADD CONSTRAINT "preventive_maintenance_plans_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Wire PM event foreign keys
ALTER TABLE "preventive_maintenance_events"
ADD CONSTRAINT "preventive_maintenance_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_events"
ADD CONSTRAINT "preventive_maintenance_events_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "preventive_maintenance_plans"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_events"
ADD CONSTRAINT "preventive_maintenance_events_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "asset_identities"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_events"
ADD CONSTRAINT "preventive_maintenance_events_assigned_service_center_id_fkey"
FOREIGN KEY ("assigned_service_center_id") REFERENCES "service_centers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_events"
ADD CONSTRAINT "preventive_maintenance_events_assigned_technician_id_fkey"
FOREIGN KEY ("assigned_technician_id") REFERENCES "technicians"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
