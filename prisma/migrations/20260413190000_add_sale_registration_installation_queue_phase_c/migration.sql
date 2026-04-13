CREATE TYPE "SaleRegistrationChannel" AS ENUM (
  'carton_scan',
  'manual_admin',
  'erp_seeded',
  'salesman_assisted'
);

CREATE TYPE "SaleRegistrationStatus" AS ENUM (
  'registered',
  'job_created',
  'cancelled'
);

CREATE TYPE "InstallationJobStatus" AS ENUM (
  'pending_assignment',
  'assigned',
  'scheduled',
  'technician_enroute',
  'on_site',
  'commissioning',
  'completed',
  'cancelled',
  'failed'
);

CREATE TABLE "serialized_sales_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "source_document_number" VARCHAR(120),
  "source_line_number" VARCHAR(80),
  "source_record_key" VARCHAR(180),
  "item_code" VARCHAR(120),
  "item_description" TEXT,
  "serial_number" VARCHAR(255) NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  "channel_code" VARCHAR(120),
  "dealer_name" VARCHAR(255),
  "distributor_name" VARCHAR(255),
  "warehouse_code" VARCHAR(120),
  "transaction_date" TIMESTAMP(3),
  "source_system" VARCHAR(80),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "serialized_sales_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_registrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "asset_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_line_id" UUID,
  "channel" "SaleRegistrationChannel" NOT NULL,
  "dealer_name" VARCHAR(255),
  "distributor_name" VARCHAR(255),
  "purchase_date" TIMESTAMP(3),
  "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "SaleRegistrationStatus" NOT NULL DEFAULT 'registered',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "installation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_number" VARCHAR(30) NOT NULL,
  "asset_id" UUID NOT NULL,
  "sale_registration_id" UUID,
  "manufacturer_org_id" UUID NOT NULL,
  "assigned_service_center_id" UUID,
  "assigned_technician_id" UUID,
  "status" "InstallationJobStatus" NOT NULL DEFAULT 'pending_assignment',
  "scheduled_for" TIMESTAMP(3),
  "technician_started_at" TIMESTAMP(3),
  "technician_completed_at" TIMESTAMP(3),
  "activation_triggered_at" TIMESTAMP(3),
  "checklist_template_snapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "commissioning_template_snapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "serialized_sales_lines_asset_id_key"
  ON "serialized_sales_lines"("asset_id");
CREATE UNIQUE INDEX "serialized_sales_lines_org_source_record_key_key"
  ON "serialized_sales_lines"("organization_id", "source_record_key");
CREATE UNIQUE INDEX "sale_registrations_asset_id_key"
  ON "sale_registrations"("asset_id");
CREATE UNIQUE INDEX "sale_registrations_sales_line_id_key"
  ON "sale_registrations"("sales_line_id");
CREATE UNIQUE INDEX "installation_jobs_job_number_key"
  ON "installation_jobs"("job_number");
CREATE UNIQUE INDEX "installation_jobs_sale_registration_id_key"
  ON "installation_jobs"("sale_registration_id");

CREATE INDEX "idx_serialized_sales_lines_org_date"
  ON "serialized_sales_lines"("organization_id", "transaction_date");
CREATE INDEX "idx_serialized_sales_lines_org_serial"
  ON "serialized_sales_lines"("organization_id", "serial_number");
CREATE INDEX "idx_sale_registrations_org_status_registered"
  ON "sale_registrations"("organization_id", "status", "registered_at");
CREATE INDEX "idx_installation_jobs_manufacturer_status"
  ON "installation_jobs"("manufacturer_org_id", "status");
CREATE INDEX "idx_installation_jobs_service_center_status"
  ON "installation_jobs"("assigned_service_center_id", "status");
CREATE INDEX "idx_installation_jobs_asset"
  ON "installation_jobs"("asset_id");

ALTER TABLE "serialized_sales_lines"
  ADD CONSTRAINT "serialized_sales_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "serialized_sales_lines"
  ADD CONSTRAINT "serialized_sales_lines_asset_id_fkey"
  FOREIGN KEY ("asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sale_registrations"
  ADD CONSTRAINT "sale_registrations_asset_id_fkey"
  FOREIGN KEY ("asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sale_registrations"
  ADD CONSTRAINT "sale_registrations_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sale_registrations"
  ADD CONSTRAINT "sale_registrations_sales_line_id_fkey"
  FOREIGN KEY ("sales_line_id")
  REFERENCES "serialized_sales_lines"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "installation_jobs"
  ADD CONSTRAINT "installation_jobs_asset_id_fkey"
  FOREIGN KEY ("asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "installation_jobs"
  ADD CONSTRAINT "installation_jobs_sale_registration_id_fkey"
  FOREIGN KEY ("sale_registration_id")
  REFERENCES "sale_registrations"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "installation_jobs"
  ADD CONSTRAINT "installation_jobs_manufacturer_org_id_fkey"
  FOREIGN KEY ("manufacturer_org_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "installation_jobs"
  ADD CONSTRAINT "installation_jobs_assigned_service_center_id_fkey"
  FOREIGN KEY ("assigned_service_center_id")
  REFERENCES "service_centers"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "installation_jobs"
  ADD CONSTRAINT "installation_jobs_assigned_technician_id_fkey"
  FOREIGN KEY ("assigned_technician_id")
  REFERENCES "technicians"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
