CREATE TABLE "chat_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "company" VARCHAR(255) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "language" VARCHAR(100) NOT NULL,
    "user_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_leads_session_id_key" ON "chat_leads"("session_id");
