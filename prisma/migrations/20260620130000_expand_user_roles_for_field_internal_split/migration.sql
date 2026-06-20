BEGIN;

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM (
  'platform_owner',
  'field_super_admin',
  'field_service_admin',
  'manufacturer_admin',
  'service_center_admin',
  'field_dispatcher',
  'field_technician',
  'internal_service_super_admin',
  'internal_service_admin',
  'internal_inward_operator',
  'internal_service_engineer',
  'internal_service_qa',
  'internal_service_stock',
  'internal_label_admin',
  'customer'
);

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "UserRole"
USING (
  CASE "role"::text
    WHEN 'super_admin' THEN 'platform_owner'
    WHEN 'technician' THEN 'field_technician'
    ELSE "role"::text
  END
)::"UserRole";

DROP TYPE "UserRole_old";

COMMIT;
