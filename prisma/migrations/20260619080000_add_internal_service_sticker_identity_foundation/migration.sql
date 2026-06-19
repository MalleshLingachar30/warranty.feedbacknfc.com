CREATE TYPE "InternalServiceControlTagSource" AS ENUM (
  'dashboard_v1',
  'existing_tag',
  'new_affixed_label'
);

ALTER TABLE "internal_service_orders"
  ADD COLUMN "controlling_tag_id" UUID,
  ADD COLUMN "controlling_tag_source" "InternalServiceControlTagSource" NOT NULL DEFAULT 'dashboard_v1',
  ADD COLUMN "controlling_tag_resolved_at" TIMESTAMP(3);

CREATE INDEX "idx_internal_service_orders_controlling_tag"
  ON "internal_service_orders"("controlling_tag_id");

ALTER TABLE "internal_service_orders"
  ADD CONSTRAINT "internal_service_orders_controlling_tag_id_fkey"
  FOREIGN KEY ("controlling_tag_id")
  REFERENCES "asset_tags"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
