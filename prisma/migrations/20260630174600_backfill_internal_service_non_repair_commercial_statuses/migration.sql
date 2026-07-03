UPDATE "internal_service_orders"
SET "status" = CASE ("metadata"::jsonb ->> 'commercialReviewDecision')
  WHEN 'oem_warranty_claim' THEN 'oem_claim_in_progress'::"InternalServiceStatus"
  WHEN 'oem_repair_exchange' THEN 'oem_exchange_in_progress'::"InternalServiceStatus"
  WHEN 'chargeable_replacement' THEN 'replacement_approved'::"InternalServiceStatus"
  WHEN 'no_oem_support' THEN 'no_oem_support'::"InternalServiceStatus"
  ELSE "status"
END
WHERE "status" = 'under_diagnosis'
  AND ("metadata"::jsonb ->> 'commercialReviewPending') = 'false'
  AND ("metadata"::jsonb ->> 'commercialReviewReturnedAt') IS NOT NULL
  AND ("metadata"::jsonb ->> 'commercialReviewDecision') IN (
    'oem_warranty_claim',
    'oem_repair_exchange',
    'chargeable_replacement',
    'no_oem_support'
  );

UPDATE "asset_identities" ai
SET "lifecycle_state" = CASE (iso."metadata"::jsonb ->> 'commercialReviewDecision')
  WHEN 'oem_warranty_claim' THEN 'oem_claim_in_progress'::"AssetLifecycleState"
  WHEN 'oem_repair_exchange' THEN 'oem_exchange_in_progress'::"AssetLifecycleState"
  WHEN 'chargeable_replacement' THEN 'replacement_approved'::"AssetLifecycleState"
  WHEN 'no_oem_support' THEN 'no_oem_support'::"AssetLifecycleState"
  ELSE ai."lifecycle_state"
END
FROM "internal_service_orders" iso
WHERE ai."id" = iso."asset_id"
  AND iso."status" IN (
    'oem_claim_in_progress',
    'oem_exchange_in_progress',
    'replacement_approved',
    'no_oem_support'
  );
