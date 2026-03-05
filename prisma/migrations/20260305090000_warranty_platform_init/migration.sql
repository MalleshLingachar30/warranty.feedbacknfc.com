-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('manufacturer', 'distributor', 'service_center', 'retailer');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('pilot', 'starter', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'manufacturer_admin', 'service_center_admin', 'technician', 'customer');

-- CreateEnum
CREATE TYPE "StickerType" AS ENUM ('qr_only', 'nfc_qr');

-- CreateEnum
CREATE TYPE "StickerVariant" AS ENUM ('standard', 'high_temp', 'premium');

-- CreateEnum
CREATE TYPE "StickerStatus" AS ENUM ('unallocated', 'allocated', 'bound', 'activated', 'deactivated');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('pending_activation', 'active', 'expired', 'extended', 'voided');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('ai_auto', 'manual', 'escalated');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('reported', 'assigned', 'technician_enroute', 'work_in_progress', 'pending_confirmation', 'resolved', 'reopened', 'escalated', 'closed');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('warranty_repair', 'warranty_replacement', 'extended_warranty', 'goodwill');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('auto_generated', 'submitted', 'under_review', 'approved', 'rejected', 'disputed', 'paid', 'closed');

-- CreateEnum
CREATE TYPE "StickerAllocationType" AS ENUM ('bulk_bind', 'reserve_only');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "slug" VARCHAR(100),
    "logo_url" TEXT,
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(50) NOT NULL DEFAULT 'IN',
    "pincode" VARCHAR(10),
    "gst_number" VARCHAR(20),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(20),
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'pilot',
    "subscription_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_id" VARCHAR(255) NOT NULL,
    "organization_id" UUID,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "name" VARCHAR(255),
    "role" "UserRole" NOT NULL,
    "language_preference" VARCHAR(5) NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "sub_category" VARCHAR(100),
    "model_number" VARCHAR(100),
    "description" TEXT,
    "image_url" TEXT,
    "warranty_duration_months" INTEGER NOT NULL DEFAULT 12,
    "extended_warranty_available" BOOLEAN NOT NULL DEFAULT false,
    "extended_warranty_months" INTEGER,
    "specifications" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "common_issues" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "required_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parts_catalog" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sticker_number" INTEGER NOT NULL,
    "sticker_serial" VARCHAR(20) NOT NULL,
    "type" "StickerType" NOT NULL DEFAULT 'qr_only',
    "variant" "StickerVariant" NOT NULL DEFAULT 'standard',
    "status" "StickerStatus" NOT NULL DEFAULT 'unallocated',
    "allocated_to_org" UUID,
    "batch_id" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sticker_id" UUID NOT NULL,
    "product_model_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "serial_number" VARCHAR(255),
    "manufacture_date" DATE,
    "sale_date" DATE,
    "installation_date" DATE,
    "warranty_start_date" TIMESTAMP(3),
    "warranty_end_date" TIMESTAMP(3),
    "warranty_status" "WarrantyStatus" NOT NULL DEFAULT 'pending_activation',
    "extended_warranty_end_date" TIMESTAMP(3),
    "customer_id" UUID,
    "customer_name" VARCHAR(255),
    "customer_phone" VARCHAR(20),
    "customer_email" VARCHAR(255),
    "customer_address" TEXT,
    "customer_city" VARCHAR(100),
    "customer_state" VARCHAR(100),
    "customer_pincode" VARCHAR(10),
    "installation_location" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "location" point,
    "service_radius_km" INTEGER NOT NULL DEFAULT 50,
    "supported_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manufacturer_authorizations" UUID[] DEFAULT ARRAY[]::UUID[],
    "operating_hours" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "total_jobs_completed" INTEGER NOT NULL DEFAULT 0,
    "average_resolution_hours" DECIMAL(6,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "service_center_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "skills" TEXT[],
    "certifications" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "current_location" point,
    "max_concurrent_jobs" INTEGER NOT NULL DEFAULT 3,
    "active_job_count" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "total_jobs_completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_number" VARCHAR(20) NOT NULL,
    "product_id" UUID NOT NULL,
    "sticker_id" UUID NOT NULL,
    "reported_by_user_id" UUID,
    "reported_by_name" VARCHAR(255),
    "reported_by_phone" VARCHAR(20) NOT NULL,
    "issue_category" VARCHAR(100),
    "issue_description" TEXT NOT NULL,
    "issue_severity" "IssueSeverity" NOT NULL DEFAULT 'medium',
    "issue_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assigned_service_center_id" UUID,
    "assigned_technician_id" UUID,
    "assignment_method" "AssignmentMethod" NOT NULL DEFAULT 'ai_auto',
    "assignment_notes" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMP(3),
    "technician_started_at" TIMESTAMP(3),
    "technician_completed_at" TIMESTAMP(3),
    "customer_confirmed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "status" "TicketStatus" NOT NULL DEFAULT 'reported',
    "resolution_notes" TEXT,
    "resolution_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parts_used" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "labor_hours" DECIMAL(4,2),
    "claim_id" UUID,
    "is_warranty_covered" BOOLEAN NOT NULL DEFAULT true,
    "sla_response_deadline" TIMESTAMP(3),
    "sla_resolution_deadline" TIMESTAMP(3),
    "sla_breached" BOOLEAN NOT NULL DEFAULT false,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "escalated_at" TIMESTAMP(3),
    "escalation_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claim_number" VARCHAR(20) NOT NULL,
    "ticket_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "manufacturer_org_id" UUID NOT NULL,
    "service_center_org_id" UUID NOT NULL,
    "claim_type" "ClaimType" NOT NULL DEFAULT 'warranty_repair',
    "parts_cost" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "labor_cost" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total_claim_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "documentation" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "documentation_pdf_url" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'auto_generated',
    "rejection_reason" TEXT,
    "approved_amount" DECIMAL(10,2),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "payment_reference" VARCHAR(255),
    "paid_at" TIMESTAMP(3),
    "payment_method" VARCHAR(50),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_timeline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_description" TEXT,
    "actor_user_id" UUID,
    "actor_role" VARCHAR(50),
    "actor_name" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "sticker_start_number" INTEGER NOT NULL,
    "sticker_end_number" INTEGER NOT NULL,
    "total_count" INTEGER NOT NULL,
    "product_model_id" UUID,
    "allocation_type" "StickerAllocationType" NOT NULL DEFAULT 'bulk_bind',
    "appliance_serial_prefix" VARCHAR(50),
    "appliance_serial_start" VARCHAR(100),
    "appliance_serial_end" VARCHAR(100),
    "allocated_by" UUID,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- CreateIndex
CREATE UNIQUE INDEX "stickers_sticker_number_key" ON "stickers"("sticker_number");

-- CreateIndex
CREATE UNIQUE INDEX "stickers_sticker_serial_key" ON "stickers"("sticker_serial");

-- CreateIndex
CREATE INDEX "idx_stickers_number" ON "stickers"("sticker_number");

-- CreateIndex
CREATE UNIQUE INDEX "products_sticker_id_key" ON "products"("sticker_id");

-- CreateIndex
CREATE INDEX "idx_products_warranty" ON "products"("warranty_status", "warranty_end_date");

-- CreateIndex
CREATE INDEX "idx_service_centers_location" ON "service_centers" USING GIST ("location");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_user_id_key" ON "technicians"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_claim_id_key" ON "tickets"("claim_id");

-- CreateIndex
CREATE INDEX "idx_tickets_status" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "idx_tickets_product" ON "tickets"("product_id");

-- CreateIndex
CREATE INDEX "idx_tickets_technician" ON "tickets"("assigned_technician_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_claim_number_key" ON "warranty_claims"("claim_number");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_ticket_id_key" ON "warranty_claims"("ticket_id");

-- CreateIndex
CREATE INDEX "idx_timeline_ticket" ON "ticket_timeline"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_allocated_to_org_fkey" FOREIGN KEY ("allocated_to_org") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "stickers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_product_model_id_fkey" FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_centers" ADD CONSTRAINT "service_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "stickers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_service_center_id_fkey" FOREIGN KEY ("assigned_service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "warranty_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_manufacturer_org_id_fkey" FOREIGN KEY ("manufacturer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_service_center_org_id_fkey" FOREIGN KEY ("service_center_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_timeline" ADD CONSTRAINT "ticket_timeline_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_timeline" ADD CONSTRAINT "ticket_timeline_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_allocations" ADD CONSTRAINT "sticker_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_allocations" ADD CONSTRAINT "sticker_allocations_product_model_id_fkey" FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_allocations" ADD CONSTRAINT "sticker_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

