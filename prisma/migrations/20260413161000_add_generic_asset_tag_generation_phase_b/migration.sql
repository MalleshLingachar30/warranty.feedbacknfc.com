CREATE TYPE "AssetProductClass" AS ENUM (
  'main_product',
  'spare_part',
  'small_part',
  'kit',
  'pack'
);

CREATE TYPE "AssetLifecycleState" AS ENUM (
  'generated',
  'packed',
  'sold_pending_installation',
  'installation_scheduled',
  'installation_in_progress',
  'active',
  'consumed',
  'retired',
  'voided'
);

CREATE TYPE "TagClass" AS ENUM (
  'unit_service',
  'carton_registration',
  'component_unit',
  'small_part_batch',
  'kit_parent',
  'pack_parent'
);

CREATE TYPE "TagSymbology" AS ENUM (
  'qr',
  'data_matrix',
  'nfc_uri'
);

CREATE TYPE "AssetTagStatus" AS ENUM (
  'generated',
  'printed',
  'encoded',
  'active',
  'voided'
);

CREATE TYPE "TagViewerPolicy" AS ENUM (
  'public',
  'owner_only',
  'technician_admin',
  'warehouse_admin'
);

CREATE TABLE "tag_generation_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "product_model_id" UUID NOT NULL,
  "product_class" "AssetProductClass" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "serial_prefix" VARCHAR(100),
  "serial_start" VARCHAR(100),
  "serial_end" VARCHAR(100),
  "include_carton_registration_tags" BOOLEAN NOT NULL DEFAULT false,
  "default_symbology" "TagSymbology" NOT NULL,
  "output_profile" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tag_generation_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "public_code" VARCHAR(80) NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_model_id" UUID NOT NULL,
  "product_class" "AssetProductClass" NOT NULL,
  "serial_number" VARCHAR(255),
  "batch_code" VARCHAR(120),
  "lifecycle_state" "AssetLifecycleState" NOT NULL DEFAULT 'generated',
  "warranty_state" "WarrantyStatus",
  "customer_id" UUID,
  "installation_date" TIMESTAMP(3),
  "installation_location" JSONB,
  "root_main_asset_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "generation_batch_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "public_code" VARCHAR(100) NOT NULL,
  "asset_id" UUID NOT NULL,
  "generation_batch_id" UUID,
  "tag_class" "TagClass" NOT NULL,
  "symbology" "TagSymbology" NOT NULL,
  "status" "AssetTagStatus" NOT NULL DEFAULT 'generated',
  "material_variant" "StickerVariant" NOT NULL DEFAULT 'standard',
  "print_size_mm" INTEGER,
  "encoded_value" TEXT NOT NULL,
  "viewer_policy" "TagViewerPolicy" NOT NULL DEFAULT 'public',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_identities_public_code_key" ON "asset_identities"("public_code");
CREATE UNIQUE INDEX "asset_tags_public_code_key" ON "asset_tags"("public_code");

CREATE INDEX "idx_tag_generation_batches_org_created"
  ON "tag_generation_batches"("organization_id", "created_at");
CREATE INDEX "idx_tag_generation_batches_model"
  ON "tag_generation_batches"("product_model_id");
CREATE INDEX "idx_asset_identities_org_class"
  ON "asset_identities"("organization_id", "product_class");
CREATE INDEX "idx_asset_identities_org_model"
  ON "asset_identities"("organization_id", "product_model_id");
CREATE INDEX "idx_asset_identities_serial"
  ON "asset_identities"("serial_number");
CREATE INDEX "idx_asset_identities_batch"
  ON "asset_identities"("generation_batch_id");
CREATE INDEX "idx_asset_tags_asset"
  ON "asset_tags"("asset_id");
CREATE INDEX "idx_asset_tags_batch"
  ON "asset_tags"("generation_batch_id");
CREATE INDEX "idx_asset_tags_symbology_status"
  ON "asset_tags"("symbology", "status");

ALTER TABLE "tag_generation_batches"
  ADD CONSTRAINT "tag_generation_batches_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "tag_generation_batches"
  ADD CONSTRAINT "tag_generation_batches_product_model_id_fkey"
  FOREIGN KEY ("product_model_id")
  REFERENCES "product_models"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "tag_generation_batches"
  ADD CONSTRAINT "tag_generation_batches_created_by_id_fkey"
  FOREIGN KEY ("created_by_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "asset_identities"
  ADD CONSTRAINT "asset_identities_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "asset_identities"
  ADD CONSTRAINT "asset_identities_product_model_id_fkey"
  FOREIGN KEY ("product_model_id")
  REFERENCES "product_models"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "asset_identities"
  ADD CONSTRAINT "asset_identities_customer_id_fkey"
  FOREIGN KEY ("customer_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "asset_identities"
  ADD CONSTRAINT "asset_identities_root_main_asset_id_fkey"
  FOREIGN KEY ("root_main_asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "asset_identities"
  ADD CONSTRAINT "asset_identities_generation_batch_id_fkey"
  FOREIGN KEY ("generation_batch_id")
  REFERENCES "tag_generation_batches"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "asset_tags"
  ADD CONSTRAINT "asset_tags_asset_id_fkey"
  FOREIGN KEY ("asset_id")
  REFERENCES "asset_identities"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "asset_tags"
  ADD CONSTRAINT "asset_tags_generation_batch_id_fkey"
  FOREIGN KEY ("generation_batch_id")
  REFERENCES "tag_generation_batches"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
