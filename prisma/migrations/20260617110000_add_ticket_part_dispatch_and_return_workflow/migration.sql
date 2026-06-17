-- Create enums for spare dispatch and removed-part return workflows
CREATE TYPE "TicketPartDispatchStatus" AS ENUM (
  'planned',
  'dispatched',
  'received_by_technician',
  'partially_reconciled',
  'fully_reconciled',
  'cancelled'
);

CREATE TYPE "TicketPartDispatchItemStatus" AS ENUM (
  'planned',
  'dispatched',
  'received_by_technician',
  'installed',
  'consumed',
  'returned_unused',
  'partially_reconciled',
  'cancelled'
);

CREATE TYPE "TicketPartReturnStatus" AS ENUM (
  'awaiting_collection',
  'collected_by_technician',
  'received_at_service_center',
  'received_by_manufacturer',
  'closed',
  'cancelled'
);

-- Add forward-link from field part usage to dispatched spare line item
ALTER TABLE "job_part_usages"
ADD COLUMN "dispatch_item_id" UUID;

-- Create spare dispatch header table
CREATE TABLE "ticket_part_dispatches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" UUID NOT NULL,
  "service_center_id" UUID NOT NULL,
  "assigned_technician_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "dispatch_number" VARCHAR(30) NOT NULL,
  "status" "TicketPartDispatchStatus" NOT NULL DEFAULT 'planned',
  "planned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatched_at" TIMESTAMP(3),
  "received_by_technician_at" TIMESTAMP(3),
  "reconciled_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "notes" VARCHAR(500),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_part_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_part_dispatches_dispatch_number_key"
ON "ticket_part_dispatches"("dispatch_number");

CREATE INDEX "idx_ticket_part_dispatches_ticket_status"
ON "ticket_part_dispatches"("ticket_id", "status");

CREATE INDEX "idx_ticket_part_dispatches_service_center_status"
ON "ticket_part_dispatches"("service_center_id", "status");

CREATE INDEX "idx_ticket_part_dispatches_technician_status"
ON "ticket_part_dispatches"("assigned_technician_id", "status");

CREATE INDEX "idx_ticket_part_dispatches_planned_at"
ON "ticket_part_dispatches"("planned_at");

-- Create spare dispatch line-item table
CREATE TABLE "ticket_part_dispatch_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dispatch_id" UUID NOT NULL,
  "catalog_part_id" VARCHAR(120),
  "part_name" VARCHAR(255) NOT NULL,
  "part_number" VARCHAR(120),
  "spare_asset_id" UUID,
  "spare_tag_id" UUID,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1.000,
  "unit_cost" DECIMAL(12,2),
  "status" "TicketPartDispatchItemStatus" NOT NULL DEFAULT 'planned',
  "dispatched_at" TIMESTAMP(3),
  "received_by_technician_at" TIMESTAMP(3),
  "reconciled_at" TIMESTAMP(3),
  "notes" VARCHAR(500),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_part_dispatch_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ticket_part_dispatch_items_dispatch_status"
ON "ticket_part_dispatch_items"("dispatch_id", "status");

CREATE INDEX "idx_ticket_part_dispatch_items_spare_asset"
ON "ticket_part_dispatch_items"("spare_asset_id");

CREATE INDEX "idx_ticket_part_dispatch_items_spare_tag"
ON "ticket_part_dispatch_items"("spare_tag_id");

CREATE INDEX "idx_ticket_part_dispatch_items_part_number"
ON "ticket_part_dispatch_items"("part_number");

-- Create removed-part return obligation table
CREATE TABLE "ticket_part_returns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" UUID NOT NULL,
  "source_usage_id" UUID,
  "main_asset_id" UUID NOT NULL,
  "removed_asset_id" UUID,
  "removed_tag_id" UUID,
  "service_center_id" UUID,
  "technician_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "return_number" VARCHAR(30) NOT NULL,
  "status" "TicketPartReturnStatus" NOT NULL DEFAULT 'awaiting_collection',
  "part_name" VARCHAR(255) NOT NULL,
  "part_number" VARCHAR(120),
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1.000,
  "collection_notes" VARCHAR(500),
  "collected_at" TIMESTAMP(3),
  "received_at_service_center_at" TIMESTAMP(3),
  "received_by_manufacturer_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_part_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_part_returns_source_usage_id_key"
ON "ticket_part_returns"("source_usage_id");

CREATE UNIQUE INDEX "ticket_part_returns_return_number_key"
ON "ticket_part_returns"("return_number");

CREATE INDEX "idx_ticket_part_returns_ticket_status"
ON "ticket_part_returns"("ticket_id", "status");

CREATE INDEX "idx_ticket_part_returns_service_center_status"
ON "ticket_part_returns"("service_center_id", "status");

CREATE INDEX "idx_ticket_part_returns_technician_status"
ON "ticket_part_returns"("technician_id", "status");

CREATE INDEX "idx_ticket_part_returns_main_asset"
ON "ticket_part_returns"("main_asset_id");

CREATE INDEX "idx_ticket_part_returns_removed_asset"
ON "ticket_part_returns"("removed_asset_id");

CREATE INDEX "idx_job_part_usages_dispatch_item"
ON "job_part_usages"("dispatch_item_id");

-- Wire foreign keys
ALTER TABLE "job_part_usages"
ADD CONSTRAINT "job_part_usages_dispatch_item_id_fkey"
FOREIGN KEY ("dispatch_item_id") REFERENCES "ticket_part_dispatch_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatches"
ADD CONSTRAINT "ticket_part_dispatches_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatches"
ADD CONSTRAINT "ticket_part_dispatches_service_center_id_fkey"
FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatches"
ADD CONSTRAINT "ticket_part_dispatches_assigned_technician_id_fkey"
FOREIGN KEY ("assigned_technician_id") REFERENCES "technicians"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatches"
ADD CONSTRAINT "ticket_part_dispatches_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatch_items"
ADD CONSTRAINT "ticket_part_dispatch_items_dispatch_id_fkey"
FOREIGN KEY ("dispatch_id") REFERENCES "ticket_part_dispatches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatch_items"
ADD CONSTRAINT "ticket_part_dispatch_items_spare_asset_id_fkey"
FOREIGN KEY ("spare_asset_id") REFERENCES "asset_identities"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_dispatch_items"
ADD CONSTRAINT "ticket_part_dispatch_items_spare_tag_id_fkey"
FOREIGN KEY ("spare_tag_id") REFERENCES "asset_tags"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_source_usage_id_fkey"
FOREIGN KEY ("source_usage_id") REFERENCES "job_part_usages"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_main_asset_id_fkey"
FOREIGN KEY ("main_asset_id") REFERENCES "asset_identities"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_removed_asset_id_fkey"
FOREIGN KEY ("removed_asset_id") REFERENCES "asset_identities"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_removed_tag_id_fkey"
FOREIGN KEY ("removed_tag_id") REFERENCES "asset_tags"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_service_center_id_fkey"
FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_technician_id_fkey"
FOREIGN KEY ("technician_id") REFERENCES "technicians"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_part_returns"
ADD CONSTRAINT "ticket_part_returns_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
