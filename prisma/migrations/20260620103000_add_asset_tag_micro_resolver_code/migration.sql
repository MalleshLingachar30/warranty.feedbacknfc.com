ALTER TABLE "asset_tags"
ADD COLUMN "micro_resolver_code" VARCHAR(16);

CREATE UNIQUE INDEX "asset_tags_micro_resolver_code_key"
ON "asset_tags"("micro_resolver_code");
