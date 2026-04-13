CREATE TYPE "ActivationMode" AS ENUM (
  'plug_and_play',
  'installation_driven'
);

CREATE TYPE "InstallationOwnershipMode" AS ENUM (
  'manufacturer_only',
  'dealer_allowed'
);

CREATE TYPE "ActivationTrigger" AS ENUM (
  'self_activation',
  'installation_report_submission'
);

CREATE TYPE "CustomerCreationMode" AS ENUM (
  'on_activation',
  'on_installation'
);

CREATE TYPE "PartTraceabilityMode" AS ENUM (
  'none',
  'pack_or_kit',
  'unit_scan_mandatory'
);

CREATE TYPE "SmallPartTrackingMode" AS ENUM (
  'individual',
  'pack_level',
  'kit_level',
  'pack_or_kit'
);

ALTER TABLE "product_models"
  ADD COLUMN "activation_mode" "ActivationMode" NOT NULL DEFAULT 'plug_and_play',
  ADD COLUMN "installation_ownership_mode" "InstallationOwnershipMode" NOT NULL DEFAULT 'manufacturer_only',
  ADD COLUMN "installation_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "activation_trigger" "ActivationTrigger" NOT NULL DEFAULT 'self_activation',
  ADD COLUMN "customer_creation_mode" "CustomerCreationMode" NOT NULL DEFAULT 'on_activation',
  ADD COLUMN "allow_carton_sale_registration" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_unit_self_activation" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "part_traceability_mode" "PartTraceabilityMode" NOT NULL DEFAULT 'none',
  ADD COLUMN "small_part_tracking_mode" "SmallPartTrackingMode" NOT NULL DEFAULT 'individual',
  ADD COLUMN "customer_acknowledgement_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "installation_checklist_template" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "commissioning_template" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "required_photo_policy" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "required_geo_capture" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "default_installer_skill_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "included_kit_definition" JSONB NOT NULL DEFAULT '{}'::jsonb;
