ALTER TYPE "InstallationJobStatus" ADD VALUE IF NOT EXISTS 'pending_customer_authorization';

ALTER TABLE "installation_reports"
ADD COLUMN "customer_authorized_at" TIMESTAMP(3),
ADD COLUMN "customer_authorized_by_name" VARCHAR(255),
ADD COLUMN "customer_authorized_by_phone" VARCHAR(20),
ADD COLUMN "customer_authorization_payload" JSONB;

CREATE INDEX "idx_installation_reports_customer_authorized_at"
ON "installation_reports"("customer_authorized_at");
