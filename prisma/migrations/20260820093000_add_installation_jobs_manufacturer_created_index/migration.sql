CREATE INDEX "idx_installation_jobs_manufacturer_created"
  ON "installation_jobs"("manufacturer_org_id", "created_at" DESC);
