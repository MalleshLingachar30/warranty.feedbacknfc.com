ALTER TABLE "job_part_usages"
DROP CONSTRAINT IF EXISTS "job_part_usages_work_object_check";

ALTER TABLE "job_part_usages"
ADD CONSTRAINT "job_part_usages_work_object_check"
CHECK (
  num_nonnulls(
    "installation_job_id",
    "ticket_id",
    "internal_service_order_id"
  ) = 1
);
