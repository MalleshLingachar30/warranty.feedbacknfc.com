CREATE TABLE "endpoint_monitor_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'healthy',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_alerted_at" TIMESTAMP(3),
    "last_resolved_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "endpoint_monitor_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "endpoint_monitor_states_check_name_key" ON "endpoint_monitor_states"("check_name");
