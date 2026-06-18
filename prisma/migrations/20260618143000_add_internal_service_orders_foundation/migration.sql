-- Expand asset lifecycle for inward receipt, depot service, QA, and disposition
ALTER TYPE "AssetLifecycleState" ADD VALUE 'inward_received';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'in_service_inventory';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'awaiting_triage';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'under_diagnosis';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'awaiting_parts';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'under_repair';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'awaiting_qc';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'qa_failed';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'qa_passed';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'ready_for_return';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'refurbished_saleable';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'returned_to_stock';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'scrap_pending';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'scrapped';
ALTER TYPE "AssetLifecycleState" ADD VALUE 'cannibalized';

-- Create internal-service enums
CREATE TYPE "InternalServiceType" AS ENUM (
  'depot_repair',
  'preventive_maintenance',
  'calibration',
  'refurbishment',
  'qa_inspection',
  'demo_preparation',
  'field_campaign',
  'distributor_rework'
);

CREATE TYPE "InternalServicePriority" AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE "InternalServiceStatus" AS ENUM (
  'draft',
  'inward_received',
  'awaiting_triage',
  'under_diagnosis',
  'awaiting_parts',
  'repair_in_progress',
  'awaiting_qc',
  'qa_failed',
  'ready_for_disposition',
  'completed',
  'closed',
  'cancelled'
);

CREATE TYPE "InternalServiceInitiationSource" AS ENUM (
  'customer_return',
  'distributor_return',
  'service_center_return',
  'production_rejection',
  'demo_return',
  'internal_qc',
  'manual_admin'
);

CREATE TYPE "InternalServiceDisposition" AS ENUM (
  'returned_to_customer',
  'returned_to_distributor',
  'returned_to_service_center',
  'refurbished_saleable',
  'returned_to_stock',
  'scrapped',
  'cannibalized',
  'no_fault_found_return'
);

-- Allow traced part usage to link to internal service work orders
ALTER TABLE "job_part_usages"
ADD COLUMN "internal_service_order_id" UUID;

CREATE INDEX "idx_job_part_usages_internal_service_order"
ON "job_part_usages"("internal_service_order_id");

-- Create internal service order header table
CREATE TABLE "internal_service_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_number" VARCHAR(30) NOT NULL,
  "asset_id" UUID NOT NULL,
  "manufacturer_org_id" UUID NOT NULL,
  "service_center_id" UUID NOT NULL,
  "assigned_technician_id" UUID,
  "requested_by_user_id" UUID NOT NULL,
  "received_by_user_id" UUID,
  "source_organization_id" UUID,
  "initiation_source" "InternalServiceInitiationSource" NOT NULL,
  "service_type" "InternalServiceType" NOT NULL,
  "priority" "InternalServicePriority" NOT NULL DEFAULT 'medium',
  "status" "InternalServiceStatus" NOT NULL DEFAULT 'inward_received',
  "final_disposition" "InternalServiceDisposition",
  "reported_fault" TEXT,
  "inward_condition_notes" TEXT,
  "diagnosis_notes" TEXT,
  "resolution_notes" TEXT,
  "accessories_received" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "received_at" TIMESTAMP(3),
  "triaged_at" TIMESTAMP(3),
  "repair_started_at" TIMESTAMP(3),
  "qc_started_at" TIMESTAMP(3),
  "qc_completed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "is_saleable_after_service" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "internal_service_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_service_orders_order_number_key"
ON "internal_service_orders"("order_number");

CREATE INDEX "idx_internal_service_orders_manufacturer_status"
ON "internal_service_orders"("manufacturer_org_id", "status");

CREATE INDEX "idx_internal_service_orders_service_center_status"
ON "internal_service_orders"("service_center_id", "status");

CREATE INDEX "idx_internal_service_orders_technician_status"
ON "internal_service_orders"("assigned_technician_id", "status");

CREATE INDEX "idx_internal_service_orders_asset"
ON "internal_service_orders"("asset_id");

CREATE INDEX "idx_internal_service_orders_source_org"
ON "internal_service_orders"("source_organization_id");

CREATE INDEX "idx_internal_service_orders_received_at"
ON "internal_service_orders"("received_at");

-- Create internal service timeline table
CREATE TABLE "internal_service_timeline" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "internal_service_order_id" UUID NOT NULL,
  "event_type" VARCHAR(50) NOT NULL,
  "event_description" TEXT,
  "actor_user_id" UUID,
  "actor_role" VARCHAR(50),
  "actor_name" VARCHAR(255),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internal_service_timeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_internal_service_timeline_order"
ON "internal_service_timeline"("internal_service_order_id", "created_at");

-- Wire foreign keys
ALTER TABLE "job_part_usages"
ADD CONSTRAINT "job_part_usages_internal_service_order_id_fkey"
FOREIGN KEY ("internal_service_order_id") REFERENCES "internal_service_orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "asset_identities"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_manufacturer_org_id_fkey"
FOREIGN KEY ("manufacturer_org_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_service_center_id_fkey"
FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_assigned_technician_id_fkey"
FOREIGN KEY ("assigned_technician_id") REFERENCES "technicians"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_received_by_user_id_fkey"
FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_service_orders"
ADD CONSTRAINT "internal_service_orders_source_organization_id_fkey"
FOREIGN KEY ("source_organization_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_service_timeline"
ADD CONSTRAINT "internal_service_timeline_internal_service_order_id_fkey"
FOREIGN KEY ("internal_service_order_id") REFERENCES "internal_service_orders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_service_timeline"
ADD CONSTRAINT "internal_service_timeline_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
