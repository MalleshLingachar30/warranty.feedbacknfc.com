CREATE TYPE "AssetExternalIdentityType" AS ENUM (
  'internal_asset_code',
  'serial_number',
  'batch_number',
  'bpl_item_code',
  'manufacturer_part_number',
  'vendor_reference_code',
  'temporary_inward_code',
  'sap_equipment_number',
  'sap_material_code',
  'external_alias'
);

CREATE TYPE "AssetExternalIdentitySource" AS ENUM (
  'system_backfill',
  'manufacturer_tag_generation',
  'manual_inward',
  'manual_admin',
  'sap_import',
  'vendor_scan',
  'provisional_onboarding'
);

CREATE TYPE "AssetExternalIdentityStatus" AS ENUM (
  'active',
  'superseded',
  'retired'
);

CREATE TABLE "asset_external_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "asset_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "identity_type" "AssetExternalIdentityType" NOT NULL,
  "value" VARCHAR(255) NOT NULL,
  "normalized_value" VARCHAR(255) NOT NULL,
  "source" "AssetExternalIdentitySource" NOT NULL DEFAULT 'manual_admin',
  "status" "AssetExternalIdentityStatus" NOT NULL DEFAULT 'active',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "asset_external_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_external_identities_asset_type_normalized_key"
ON "asset_external_identities"("asset_id", "identity_type", "normalized_value");

CREATE INDEX "idx_asset_external_identities_asset"
ON "asset_external_identities"("asset_id");

CREATE INDEX "idx_asset_external_identities_org_normalized"
ON "asset_external_identities"("organization_id", "normalized_value");

CREATE INDEX "idx_asset_external_identities_org_type_normalized"
ON "asset_external_identities"("organization_id", "identity_type", "normalized_value");

ALTER TABLE "asset_external_identities"
ADD CONSTRAINT "asset_external_identities_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "asset_identities"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_external_identities"
ADD CONSTRAINT "asset_external_identities_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
