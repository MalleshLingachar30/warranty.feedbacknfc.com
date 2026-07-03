UPDATE "internal_service_orders"
SET
  "status" = 'awaiting_commercial_review',
  "metadata" = jsonb_set(
    coalesce("metadata", '{}'::jsonb),
    '{commercialReviewPending}',
    'true'::jsonb,
    true
  )
WHERE
  coalesce("metadata"->>'commercialReviewPending', 'false') = 'true'
  AND "status" = 'under_diagnosis';

UPDATE "asset_identities" ai
SET "lifecycle_state" = 'awaiting_commercial_review'
FROM "internal_service_orders" iso
WHERE
  iso."asset_id" = ai."id"
  AND iso."status" = 'awaiting_commercial_review'
  AND ai."lifecycle_state" = 'under_diagnosis';
