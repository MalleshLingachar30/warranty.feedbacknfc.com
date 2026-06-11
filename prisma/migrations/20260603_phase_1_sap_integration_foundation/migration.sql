-- CreateEnum
CREATE TYPE "IntegrationConnectorType" AS ENUM ('sap');

-- CreateEnum
CREATE TYPE "IntegrationFeedType" AS ENUM ('item_master', 'distributor_master', 'serialized_dispatch');

-- CreateEnum
CREATE TYPE "IntegrationConnectorStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "IntegrationRunStatus" AS ENUM ('pending', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "IntegrationStagingRecordStatus" AS ENUM ('staged', 'normalized', 'validated', 'applied', 'failed', 'quarantined', 'replay_queued');

-- CreateEnum
CREATE TYPE "IntegrationReplayRequestStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DispatchReconciliationStatus" AS ENUM ('pending_match', 'matched', 'applied', 'conflict', 'rejected', 'replayed');

-- AlterTable
ALTER TABLE "organizations"
ADD COLUMN "external_code" VARCHAR(120),
ADD COLUMN "parent_organization_id" UUID;

-- AlterTable
ALTER TABLE "product_models"
ADD COLUMN "external_item_code" VARCHAR(120),
ADD COLUMN "external_item_series_code" VARCHAR(120);

-- CreateTable
CREATE TABLE "integration_connectors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connector_type" "IntegrationConnectorType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "IntegrationConnectorStatus" NOT NULL DEFAULT 'active',
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_feeds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connector_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feed_type" "IntegrationFeedType" NOT NULL,
    "source_system" VARCHAR(50) NOT NULL DEFAULT 'sap',
    "display_name" VARCHAR(150) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_successful_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connector_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feed_type" "IntegrationFeedType" NOT NULL,
    "source_system" VARCHAR(50) NOT NULL DEFAULT 'sap',
    "status" "IntegrationRunStatus" NOT NULL DEFAULT 'pending',
    "total_row_count" INTEGER NOT NULL DEFAULT 0,
    "staged_row_count" INTEGER NOT NULL DEFAULT 0,
    "applied_row_count" INTEGER NOT NULL DEFAULT 0,
    "failed_row_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "error_summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_staging_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connector_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feed_type" "IntegrationFeedType" NOT NULL,
    "source_system" VARCHAR(50) NOT NULL DEFAULT 'sap',
    "external_record_key" VARCHAR(180),
    "row_number" INTEGER,
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB,
    "status" "IntegrationStagingRecordStatus" NOT NULL DEFAULT 'staged',
    "domain_target_type" VARCHAR(80),
    "domain_target_id" UUID,
    "error_code" VARCHAR(120),
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "replay_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_staging_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_replay_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connector_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "run_id" UUID,
    "staging_record_id" UUID,
    "requested_by_user_id" UUID,
    "status" "IntegrationReplayRequestStatus" NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_replay_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_item_master_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "external_item_code" VARCHAR(120) NOT NULL,
    "external_series_code" VARCHAR(120),
    "item_description" TEXT,
    "category" VARCHAR(100),
    "sub_category" VARCHAR(100),
    "model_number" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB NOT NULL,
    "product_model_id" UUID,
    "last_run_id" UUID,
    "first_imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "erp_item_master_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_distributor_master_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "external_distributor_code" VARCHAR(120) NOT NULL,
    "distributor_name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(50),
    "pincode" VARCHAR(10),
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB NOT NULL,
    "mapped_organization_id" UUID,
    "last_run_id" UUID,
    "first_imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "erp_distributor_master_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_serialized_dispatch_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "external_document_number" VARCHAR(120),
    "external_line_number" VARCHAR(80),
    "external_record_key" VARCHAR(180) NOT NULL,
    "item_code" VARCHAR(120),
    "serial_number" VARCHAR(255) NOT NULL,
    "distributor_code" VARCHAR(120),
    "warehouse_code" VARCHAR(120),
    "transaction_date" TIMESTAMP(3),
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "source_system" VARCHAR(80) NOT NULL DEFAULT 'sap',
    "status" "DispatchReconciliationStatus" NOT NULL DEFAULT 'pending_match',
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB NOT NULL,
    "asset_id" UUID,
    "product_model_id" UUID,
    "mapped_distributor_id" UUID,
    "serialized_sales_line_id" UUID,
    "last_run_id" UUID,
    "first_imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "erp_serialized_dispatch_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_integration_connectors_org_status" ON "integration_connectors"("organization_id", "status");
CREATE UNIQUE INDEX "integration_connectors_org_type_key" ON "integration_connectors"("organization_id", "connector_type");
CREATE INDEX "idx_integration_feeds_org_type" ON "integration_feeds"("organization_id", "feed_type");
CREATE UNIQUE INDEX "integration_feeds_connector_type_key" ON "integration_feeds"("connector_id", "feed_type");
CREATE INDEX "idx_integration_runs_org_feed_started" ON "integration_runs"("organization_id", "feed_type", "started_at");
CREATE INDEX "idx_integration_runs_status_started" ON "integration_runs"("status", "started_at");
CREATE INDEX "idx_integration_staging_org_feed_status" ON "integration_staging_records"("organization_id", "feed_type", "status");
CREATE INDEX "idx_integration_staging_run_row" ON "integration_staging_records"("run_id", "row_number");
CREATE INDEX "idx_integration_staging_external_key" ON "integration_staging_records"("external_record_key");
CREATE INDEX "idx_integration_replays_org_status_created" ON "integration_replay_requests"("organization_id", "status", "created_at");
CREATE INDEX "idx_erp_item_master_org_active" ON "erp_item_master_records"("organization_id", "is_active");
CREATE INDEX "idx_erp_item_master_product_model" ON "erp_item_master_records"("product_model_id");
CREATE UNIQUE INDEX "erp_item_master_records_org_item_code_key" ON "erp_item_master_records"("organization_id", "external_item_code");
CREATE INDEX "idx_erp_distributor_master_org_active" ON "erp_distributor_master_records"("organization_id", "is_active");
CREATE INDEX "idx_erp_distributor_master_mapped_org" ON "erp_distributor_master_records"("mapped_organization_id");
CREATE UNIQUE INDEX "erp_distributor_master_records_org_code_key" ON "erp_distributor_master_records"("organization_id", "external_distributor_code");
CREATE UNIQUE INDEX "erp_serialized_dispatch_records_org_record_key_key" ON "erp_serialized_dispatch_records"("organization_id", "external_record_key");
CREATE UNIQUE INDEX "erp_serialized_dispatch_records_serialized_sales_line_id_key" ON "erp_serialized_dispatch_records"("serialized_sales_line_id");
CREATE INDEX "idx_erp_serialized_dispatch_org_status_imported" ON "erp_serialized_dispatch_records"("organization_id", "status", "last_imported_at");
CREATE INDEX "idx_erp_serialized_dispatch_org_serial" ON "erp_serialized_dispatch_records"("organization_id", "serial_number");
CREATE INDEX "idx_erp_serialized_dispatch_asset" ON "erp_serialized_dispatch_records"("asset_id");
CREATE INDEX "idx_organizations_external_code" ON "organizations"("external_code");
CREATE INDEX "idx_organizations_parent_org" ON "organizations"("parent_organization_id");
CREATE UNIQUE INDEX "product_models_org_external_item_code_key" ON "product_models"("organization_id", "external_item_code");
CREATE INDEX "idx_product_models_org_external_series" ON "product_models"("organization_id", "external_item_series_code");

-- AddForeignKey
ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_parent_organization_id_fkey"
FOREIGN KEY ("parent_organization_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_connectors"
ADD CONSTRAINT "integration_connectors_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_feeds"
ADD CONSTRAINT "integration_feeds_connector_id_fkey"
FOREIGN KEY ("connector_id") REFERENCES "integration_connectors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_feeds"
ADD CONSTRAINT "integration_feeds_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_runs"
ADD CONSTRAINT "integration_runs_connector_id_fkey"
FOREIGN KEY ("connector_id") REFERENCES "integration_connectors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_runs"
ADD CONSTRAINT "integration_runs_feed_id_fkey"
FOREIGN KEY ("feed_id") REFERENCES "integration_feeds"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_runs"
ADD CONSTRAINT "integration_runs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_staging_records"
ADD CONSTRAINT "integration_staging_records_connector_id_fkey"
FOREIGN KEY ("connector_id") REFERENCES "integration_connectors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_staging_records"
ADD CONSTRAINT "integration_staging_records_feed_id_fkey"
FOREIGN KEY ("feed_id") REFERENCES "integration_feeds"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_staging_records"
ADD CONSTRAINT "integration_staging_records_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "integration_runs"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_staging_records"
ADD CONSTRAINT "integration_staging_records_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_replay_requests"
ADD CONSTRAINT "integration_replay_requests_connector_id_fkey"
FOREIGN KEY ("connector_id") REFERENCES "integration_connectors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_replay_requests"
ADD CONSTRAINT "integration_replay_requests_feed_id_fkey"
FOREIGN KEY ("feed_id") REFERENCES "integration_feeds"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_replay_requests"
ADD CONSTRAINT "integration_replay_requests_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_replay_requests"
ADD CONSTRAINT "integration_replay_requests_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "integration_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_replay_requests"
ADD CONSTRAINT "integration_replay_requests_staging_record_id_fkey"
FOREIGN KEY ("staging_record_id") REFERENCES "integration_staging_records"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_replay_requests"
ADD CONSTRAINT "integration_replay_requests_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp_item_master_records"
ADD CONSTRAINT "erp_item_master_records_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erp_item_master_records"
ADD CONSTRAINT "erp_item_master_records_product_model_id_fkey"
FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp_distributor_master_records"
ADD CONSTRAINT "erp_distributor_master_records_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erp_distributor_master_records"
ADD CONSTRAINT "erp_distributor_master_records_mapped_organization_id_fkey"
FOREIGN KEY ("mapped_organization_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp_serialized_dispatch_records"
ADD CONSTRAINT "erp_serialized_dispatch_records_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erp_serialized_dispatch_records"
ADD CONSTRAINT "erp_serialized_dispatch_records_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "asset_identities"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp_serialized_dispatch_records"
ADD CONSTRAINT "erp_serialized_dispatch_records_product_model_id_fkey"
FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp_serialized_dispatch_records"
ADD CONSTRAINT "erp_serialized_dispatch_records_mapped_distributor_id_fkey"
FOREIGN KEY ("mapped_distributor_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp_serialized_dispatch_records"
ADD CONSTRAINT "erp_serialized_dispatch_records_serialized_sales_line_id_fkey"
FOREIGN KEY ("serialized_sales_line_id") REFERENCES "serialized_sales_lines"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
