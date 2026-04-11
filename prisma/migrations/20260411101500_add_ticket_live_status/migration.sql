CREATE TYPE "TicketLiveTrackingState" AS ENUM (
  'inactive',
  'waiting_for_location',
  'enroute',
  'on_site',
  'paused',
  'stopped'
);

CREATE TABLE "ticket_live_status" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" UUID NOT NULL,
  "technician_id" UUID,
  "state" "TicketLiveTrackingState" NOT NULL DEFAULT 'inactive',
  "service_anchor_latitude" DECIMAL(9, 6),
  "service_anchor_longitude" DECIMAL(9, 6),
  "technician_latitude" DECIMAL(9, 6),
  "technician_longitude" DECIMAL(9, 6),
  "technician_accuracy_m" DECIMAL(8, 2),
  "distance_km" DECIMAL(6, 2),
  "eta_minutes" INTEGER,
  "last_updated_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "arrived_at" TIMESTAMP(3),
  "paused_at" TIMESTAMP(3),
  "stopped_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_live_status_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_live_status_ticket_id_key"
  ON "ticket_live_status"("ticket_id");

CREATE INDEX "idx_ticket_live_status_state"
  ON "ticket_live_status"("state");

CREATE INDEX "idx_ticket_live_status_technician"
  ON "ticket_live_status"("technician_id");

ALTER TABLE "ticket_live_status"
  ADD CONSTRAINT "ticket_live_status_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ticket_live_status"
  ADD CONSTRAINT "ticket_live_status_technician_id_fkey"
  FOREIGN KEY ("technician_id") REFERENCES "technicians"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
