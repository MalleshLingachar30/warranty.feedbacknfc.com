CREATE TYPE "PartUsageType" AS ENUM (
  'installed',
  'consumed',
  'returned_unused',
  'removed'
);

CREATE TABLE "job_part_usages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "installation_job_id" UUID,
  "ticket_id" UUID,
  "main_asset_id" UUID NOT NULL,
  "used_asset_id" UUID,
  "used_tag_id" UUID,
  "usage_type" "PartUsageType" NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1.000,
  "linked_by_user_id" UUID NOT NULL,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_part_usages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_work_object_check"
  CHECK (("installation_job_id" IS NOT NULL) <> ("ticket_id" IS NOT NULL));

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_quantity_check"
  CHECK ("quantity" > 0);

CREATE INDEX "idx_job_part_usages_installation_job"
  ON "job_part_usages"("installation_job_id");
CREATE INDEX "idx_job_part_usages_ticket"
  ON "job_part_usages"("ticket_id");
CREATE INDEX "idx_job_part_usages_main_asset"
  ON "job_part_usages"("main_asset_id");
CREATE INDEX "idx_job_part_usages_used_asset"
  ON "job_part_usages"("used_asset_id");
CREATE INDEX "idx_job_part_usages_linked_at"
  ON "job_part_usages"("linked_at");

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_installation_job_id_fkey"
  FOREIGN KEY ("installation_job_id")
  REFERENCES "installation_jobs"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id")
  REFERENCES "tickets"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_main_asset_id_fkey"
  FOREIGN KEY ("main_asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_used_asset_id_fkey"
  FOREIGN KEY ("used_asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_used_tag_id_fkey"
  FOREIGN KEY ("used_tag_id")
  REFERENCES "asset_tags"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "job_part_usages"
  ADD CONSTRAINT "job_part_usages_linked_by_user_id_fkey"
  FOREIGN KEY ("linked_by_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
