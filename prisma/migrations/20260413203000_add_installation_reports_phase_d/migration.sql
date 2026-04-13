CREATE TYPE "InstallationReportSubmitterRole" AS ENUM (
  'manufacturer_engineer',
  'dealer_engineer',
  'dealer_technician'
);

CREATE TYPE "CustomerAcknowledgementType" AS ENUM (
  'otp',
  'signature',
  'digital_acceptance'
);

CREATE TABLE "installation_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "installation_job_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "submitted_by_user_id" UUID NOT NULL,
  "submitted_by_role" "InstallationReportSubmitterRole" NOT NULL,
  "customer_name" VARCHAR(255) NOT NULL,
  "customer_phone" VARCHAR(20) NOT NULL,
  "customer_email" VARCHAR(255),
  "install_address" TEXT NOT NULL,
  "install_city" VARCHAR(100) NOT NULL,
  "install_state" VARCHAR(100) NOT NULL,
  "install_pincode" VARCHAR(10) NOT NULL,
  "installation_date" TIMESTAMP(3) NOT NULL,
  "installer_name" VARCHAR(255) NOT NULL,
  "unit_serial_number" VARCHAR(255) NOT NULL,
  "geo_location" JSONB NOT NULL,
  "customer_acknowledgement_type" "CustomerAcknowledgementType" NOT NULL,
  "customer_acknowledgement_payload" JSONB NOT NULL,
  "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "checklist_responses" JSONB NOT NULL,
  "commissioning_data" JSONB NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "installation_reports_installation_job_id_key"
  ON "installation_reports"("installation_job_id");
CREATE INDEX "idx_installation_reports_asset"
  ON "installation_reports"("asset_id");
CREATE INDEX "idx_installation_reports_submitted_by"
  ON "installation_reports"("submitted_by_user_id");
CREATE INDEX "idx_installation_reports_submitted_at"
  ON "installation_reports"("submitted_at");

ALTER TABLE "installation_reports"
  ADD CONSTRAINT "installation_reports_installation_job_id_fkey"
  FOREIGN KEY ("installation_job_id")
  REFERENCES "installation_jobs"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "installation_reports"
  ADD CONSTRAINT "installation_reports_asset_id_fkey"
  FOREIGN KEY ("asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "installation_reports"
  ADD CONSTRAINT "installation_reports_submitted_by_user_id_fkey"
  FOREIGN KEY ("submitted_by_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
