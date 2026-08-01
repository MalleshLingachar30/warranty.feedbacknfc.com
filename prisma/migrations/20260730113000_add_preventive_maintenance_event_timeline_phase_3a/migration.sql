-- Add audit timeline entries for preventive-maintenance event operations.
CREATE TABLE "preventive_maintenance_event_timeline" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "event_type" VARCHAR(50) NOT NULL,
  "event_description" TEXT,
  "actor_user_id" UUID,
  "actor_role" VARCHAR(50),
  "actor_name" VARCHAR(255),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "preventive_maintenance_event_timeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_pm_event_timeline_event"
  ON "preventive_maintenance_event_timeline"("event_id", "created_at");

CREATE INDEX "idx_pm_event_timeline_actor"
  ON "preventive_maintenance_event_timeline"("actor_user_id", "created_at");

ALTER TABLE "preventive_maintenance_event_timeline"
  ADD CONSTRAINT "preventive_maintenance_event_timeline_event_id_fkey"
  FOREIGN KEY ("event_id")
  REFERENCES "preventive_maintenance_events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "preventive_maintenance_event_timeline"
  ADD CONSTRAINT "preventive_maintenance_event_timeline_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
