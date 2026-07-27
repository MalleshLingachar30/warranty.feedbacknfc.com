# Preventive Maintenance Platform Spec And Action Plan

Date: 2026-07-27

## Objective

Build Preventive Maintenance (PM) as a first-class platform capability for customer-owned assets.

The feature must satisfy two customer requirements:

- Customers can see the Preventive Maintenance schedule for their registered products.
- Customers can see the history of completed PM activities inside the customer module and on the product QR/NFC journey.

This should be implemented as a clean lifecycle module tied to `AssetIdentity`, not as a workaround inside complaint tickets.

## State of Current System

The platform already has several foundations that PM can reuse:

- `AssetIdentity` is the durable serialized lifecycle identity for a product, with product model, organization, customer, installation date, tags, installation jobs, installation reports, tickets, part usage, and internal service order relationships.
- Customer module pages already show registered products, ticket counts, open/closed tickets, certificates, and product sticker links.
- Verified customer QR/NFC product pages already show warranty state, active service request state, product information, and service history.
- Technician schedule already exists as a field-service schedule surface, currently based on technician jobs.
- Installation workflow already has `scheduledFor`, technician start/completion, report submission, checklist snapshots, and customer authorization patterns that can inform PM execution.
- Internal service orders already include `preventive_maintenance` and `calibration` as internal service types, but that is depot/internal-service oriented and not a customer-visible PM schedule model.

Current gap:

- There is no dedicated PM plan model.
- There is no dedicated PM event model with due/scheduled/completed/overdue state.
- There is no auto-generation of PM events after installation/warranty activation.
- There is no customer-visible PM schedule card or completed PM activity history.
- There is no technician PM completion workflow with checklist/readings/remarks/customer acknowledgement.

## State of Ideal System

The platform should support PM as a planned lifecycle stream parallel to reactive service tickets.

### Functional Spec

PM plan configuration:

- Manufacturer admin can define PM plans at product-model level.
- A plan supports event type:
  - `preventive_maintenance`
  - `calibration`
- A plan supports cadence:
  - fixed interval after installation, such as every 3 months or every 6 months
  - fixed month offsets after installation, such as 4th month and 10th month
  - optionally manual/custom scheduled events for a specific asset
- A plan supports:
  - active/inactive status
  - service window tolerance, such as due soon threshold in days
  - default checklist template
  - optional calibration readings template
  - customer acknowledgement required/not required

PM event lifecycle:

- Events are tied to the exact asset/product identity.
- Event statuses:
  - `due`
  - `scheduled`
  - `in_progress`
  - `completed`
  - `overdue`
  - `cancelled`
- Events contain:
  - due date
  - scheduled date
  - assigned service center
  - assigned technician
  - technician started timestamp
  - completed timestamp
  - checklist responses
  - calibration readings
  - remarks
  - photo URLs
  - customer acknowledgement payload
  - cancellation reason, where applicable

Customer visibility:

- Customer dashboard shows:
  - upcoming PM events across owned products
  - overdue PM events
  - recently completed PM activities
- My Products page shows, per product:
  - next PM due/scheduled date
  - PM status badge
  - link to full PM history
- Verified customer QR/NFC product page shows:
  - next scheduled PM
  - overdue PM warning, if any
  - completed PM history for that product
- Completed PM activity should be visibly separate from complaint tickets, but both should contribute to the product lifecycle history.

Admin and technician operations:

- Manufacturer admin can create, edit, activate, and deactivate product-model PM plans.
- Manufacturer/service-center admin can view generated PM events, filter by due/scheduled/overdue/completed, and assign events to service centers/technicians.
- Field technician sees PM jobs in schedule and job list.
- Field technician can start and complete PM jobs with checklist, readings, remarks, photos, and customer acknowledgement where required.

Non-goals for the first implementation:

- Do not merge PM events into complaint `Ticket` records.
- Do not treat internal depot `InternalServiceOrder` as the source of customer-visible PM schedule.
- Do not introduce backward-compatibility fallback paths for legacy PM data because there is no first-class legacy PM model.
- Do not build full external ERP PM sync in the first pass, but leave stable identifiers and metadata fields so ERP integration can be added later.

## Proposed Data Model

Add enums:

```prisma
enum PreventiveMaintenanceEventType {
  preventive_maintenance
  calibration
}

enum PreventiveMaintenancePlanStatus {
  active
  inactive
}

enum PreventiveMaintenanceCadenceType {
  interval_days
  month_offsets
  manual
}

enum PreventiveMaintenanceEventStatus {
  due
  scheduled
  in_progress
  completed
  overdue
  cancelled
}
```

Add `PreventiveMaintenancePlan`:

```prisma
model PreventiveMaintenancePlan {
  id                              String                          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId                  String                          @map("organization_id") @db.Uuid
  productModelId                  String                          @map("product_model_id") @db.Uuid
  name                            String                          @db.VarChar(160)
  eventType                       PreventiveMaintenanceEventType   @map("event_type")
  status                          PreventiveMaintenancePlanStatus  @default(active)
  cadenceType                     PreventiveMaintenanceCadenceType @map("cadence_type")
  cadenceConfig                   Json                            @default(dbgenerated("'{}'::jsonb")) @map("cadence_config")
  dueSoonThresholdDays            Int                             @default(14) @map("due_soon_threshold_days")
  customerAcknowledgementRequired Boolean                         @default(false) @map("customer_acknowledgement_required")
  checklistTemplate               Json                            @default(dbgenerated("'[]'::jsonb")) @map("checklist_template")
  calibrationTemplate             Json                            @default(dbgenerated("'[]'::jsonb")) @map("calibration_template")
  metadata                        Json                            @default(dbgenerated("'{}'::jsonb"))
  createdByUserId                 String                          @map("created_by_user_id") @db.Uuid
  createdAt                       DateTime                        @default(now()) @map("created_at")
  updatedAt                       DateTime                        @updatedAt @map("updated_at")

  organization  Organization  @relation(fields: [organizationId], references: [id])
  productModel  ProductModel  @relation(fields: [productModelId], references: [id])
  createdByUser User          @relation(fields: [createdByUserId], references: [id])
  events        PreventiveMaintenanceEvent[]

  @@index([organizationId, status], map: "idx_pm_plans_org_status")
  @@index([productModelId, status], map: "idx_pm_plans_model_status")
  @@map("preventive_maintenance_plans")
}
```

Add `PreventiveMaintenanceEvent`:

```prisma
model PreventiveMaintenanceEvent {
  id                              String                           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  eventNumber                     String                           @unique @map("event_number") @db.VarChar(30)
  organizationId                  String                           @map("organization_id") @db.Uuid
  planId                          String?                          @map("plan_id") @db.Uuid
  assetId                         String                           @map("asset_id") @db.Uuid
  eventType                       PreventiveMaintenanceEventType    @map("event_type")
  status                          PreventiveMaintenanceEventStatus  @default(due)
  dueDate                         DateTime                         @map("due_date")
  scheduledFor                    DateTime?                        @map("scheduled_for")
  assignedServiceCenterId         String?                          @map("assigned_service_center_id") @db.Uuid
  assignedTechnicianId            String?                          @map("assigned_technician_id") @db.Uuid
  startedAt                       DateTime?                        @map("started_at")
  completedAt                     DateTime?                        @map("completed_at")
  cancelledAt                     DateTime?                        @map("cancelled_at")
  cancellationReason              String?                          @map("cancellation_reason")
  checklistTemplateSnapshot       Json                             @default(dbgenerated("'[]'::jsonb")) @map("checklist_template_snapshot")
  checklistResponses              Json                             @default(dbgenerated("'[]'::jsonb")) @map("checklist_responses")
  calibrationTemplateSnapshot     Json                             @default(dbgenerated("'[]'::jsonb")) @map("calibration_template_snapshot")
  calibrationReadings             Json                             @default(dbgenerated("'[]'::jsonb")) @map("calibration_readings")
  remarks                         String?
  photoUrls                       String[]                         @default([]) @map("photo_urls")
  customerAcknowledgementRequired Boolean                          @default(false) @map("customer_acknowledgement_required")
  customerAcknowledgedAt          DateTime?                        @map("customer_acknowledged_at")
  customerAcknowledgementPayload  Json?                            @map("customer_acknowledgement_payload")
  metadata                        Json                             @default(dbgenerated("'{}'::jsonb"))
  createdAt                       DateTime                         @default(now()) @map("created_at")
  updatedAt                       DateTime                         @updatedAt @map("updated_at")

  organization          Organization                @relation(fields: [organizationId], references: [id])
  plan                  PreventiveMaintenancePlan?  @relation(fields: [planId], references: [id])
  asset                 AssetIdentity               @relation(fields: [assetId], references: [id])
  assignedServiceCenter ServiceCenter?              @relation(fields: [assignedServiceCenterId], references: [id])
  assignedTechnician    Technician?                 @relation(fields: [assignedTechnicianId], references: [id])

  @@index([organizationId, status, dueDate], map: "idx_pm_events_org_status_due")
  @@index([assetId, dueDate], map: "idx_pm_events_asset_due")
  @@index([assignedServiceCenterId, status, scheduledFor], map: "idx_pm_events_sc_status_scheduled")
  @@index([assignedTechnicianId, status, scheduledFor], map: "idx_pm_events_tech_status_scheduled")
  @@index([planId, dueDate], map: "idx_pm_events_plan_due")
  @@map("preventive_maintenance_events")
}
```

Relation additions:

- Add `preventiveMaintenancePlans` to `Organization` and `ProductModel`.
- Add `preventiveMaintenanceEvents` to `Organization`, `AssetIdentity`, `ServiceCenter`, and `Technician`.
- Add `createdPreventiveMaintenancePlans` to `User`.

Numbering:

- PM event numbers should follow a deterministic prefix such as `PM-000001`.
- Use the repo's existing job/order number generation style if there is a local helper. If not, create a small transactional helper under `src/lib/preventive-maintenance.ts`.

## Cross-provider requirements

External integrations are not part of the first build, but the model must be integration-ready:

- Store ERP identifiers in `metadata` initially.
- Support future SAP/ERP PM plan import by mapping external maintenance plan IDs into `PreventiveMaintenancePlan.metadata`.
- Support future SAP/ERP PM order sync by mapping external order IDs into `PreventiveMaintenanceEvent.metadata`.
- Do not block local PM generation on ERP availability.
- Do not expose internal ERP payloads to customers.

## Plan Phases

### Phase 1: Schema, Domain Types, And Core Helpers

Files to read before starting:

- `prisma/schema.prisma`
- `src/lib/db.ts`
- `src/lib/installation-job-creation.ts`
- `src/lib/installation-workflow.ts`
- `src/lib/installation-workflow-view.ts`
- `src/lib/customer-context.ts`
- `src/lib/roles.ts`

What to do:

- Add PM enums and models in Prisma.
- Add relations to existing Prisma models.
- Create a migration for the new tables and indexes.
- Add `src/lib/preventive-maintenance.ts` for:
  - PM event status labels
  - customer-safe PM event projection
  - due/overdue status calculation
  - event number generation
  - cadence expansion from plan + asset installation date
- Keep helper functions pure where possible so cadence and status logic can be tested without a database.
- Use `AssetIdentity.installationDate` as the primary anchor for auto-generated PM events.
- If `AssetIdentity.installationDate` is missing, do not generate plan-based events for that asset; surface this as an admin-visible exception later.

Validation strategy:

- Run Prisma format/generate.
- Run migration validation against local database.
- Unit test cadence expansion:
  - every N days
  - fixed month offsets
  - no installation date
  - duplicate prevention for already-generated events
- Unit test status derivation:
  - due
  - due soon
  - overdue
  - completed
  - cancelled

Risks / fallbacks:

- Risk: Prisma relation names may conflict with existing relation names.
  - Resolve with explicit relation names instead of loosening the schema.
- Risk: month arithmetic can drift on dates like January 31.
  - Use a deterministic date helper and test end-of-month behavior.
- Risk: event number generation can race.
  - Generate inside a transaction or use a DB-backed sequence style already used elsewhere in the project.

### Phase 2: PM Event Generation And Admin APIs

Files to read before starting:

- `src/app/api/manufacturer/product-model/route.ts`
- `src/app/api/manufacturer/product-model/[id]/route.ts`
- `src/app/api/manufacturer/installation-jobs/[id]/route.ts`
- `src/app/api/installation-jobs/[id]/status/route.ts`
- `src/app/api/manufacturer/_utils.ts`
- `src/app/api/service-center/_utils.ts`
- `src/lib/org-context.ts`
- `src/lib/rbac.ts`

What to do:

- Add manufacturer APIs for PM plans:
  - list plans by product model
  - create plan
  - update plan
  - activate/deactivate plan
- Add manufacturer/service-center APIs for PM events:
  - list events with filters
  - assign event to service center/technician
  - schedule/reschedule event
  - cancel event with reason
- Add a generation function:
  - on installation completion, generate PM events for active plans for that product model
  - create only missing events for the plan/asset/due-date combination
  - snapshot checklist/calibration templates into each event
- Wire generation into the installation completion path after installation date is known.
- Add a manual regeneration endpoint or admin action for backfilling PM events for already-installed assets.

Validation strategy:

- API tests for manufacturer-only plan management.
- API tests for service-center assignment permissions.
- API tests to ensure customer role cannot access admin PM APIs.
- Database tests for duplicate prevention.
- Test installation completion creates expected PM events for active plans.

Risks / fallbacks:

- Risk: installation completion flow may have multiple status update paths.
  - Identify all completion paths and centralize PM generation in a shared helper called by each path.
- Risk: existing assets may not have clean installation dates.
  - Provide explicit admin exception reporting rather than generating guessed dates.
- Risk: backfill can create many events.
  - Batch by organization and product model; make the endpoint idempotent.

### Phase 3: Manufacturer And Service-Center PM Management UI

Files to read before starting:

- `src/app/(dashboard)/dashboard/manufacturer/products/page.tsx`
- `src/components/manufacturer/product-models-client.tsx`
- `src/components/manufacturer/sub-nav.tsx`
- `src/app/(dashboard)/dashboard/tickets/page.tsx`
- `src/components/manufacturer/installation-jobs-client.tsx`
- `src/components/service-center/installation-queue-client.tsx`
- `src/lib/roles.ts`

What to do:

- Add PM configuration into manufacturer product model management:
  - PM tab/section on product model details or product model card
  - create/edit PM plan form
  - cadence controls
  - checklist/calibration template editors using existing JSON/template patterns where available
  - active/inactive toggle
- Add manufacturer PM events page:
  - route: `/dashboard/manufacturer/preventive-maintenance`
  - filters: status, product model, service center, technician, due date range
  - actions: assign, schedule, cancel
- Add service-center PM queue:
  - either a tab in existing ticket/installation queue or a dedicated route
  - show assigned PM events by due/scheduled date
  - allow service-center admin to assign a technician if allowed by role model
- Add navigation entry for manufacturer admins and service-center admins only after the page exists.

Validation strategy:

- Render pages with no plans/events.
- Render pages with multiple plans and events.
- Verify status badges and date formatting.
- Verify assignment updates persist and refresh correctly.
- Run TypeScript and lint checks.

Risks / fallbacks:

- Risk: Product model UI is already dense.
  - Prefer a compact PM section with a dedicated full PM page for event operations.
- Risk: service-center and manufacturer permission boundaries differ.
  - Keep route-level checks strict; only expose assignment actions permitted by current role/context helpers.
- Risk: UI implementation becomes too broad.
  - Keep first UI version operational and table-driven; defer analytics charts.

### Phase 4: Technician PM Schedule And Completion Workflow

Files to read before starting:

- `src/app/(dashboard)/dashboard/schedule/page.tsx`
- `src/components/technician/schedule-panel.tsx`
- `src/app/(dashboard)/dashboard/my-jobs/page.tsx`
- `src/components/technician/my-jobs-board.tsx`
- `src/components/technician/job-detail.tsx`
- `src/components/technician/types.ts`
- `src/app/api/technician/jobs/route.ts`
- `src/lib/technician-context.ts`
- `src/lib/photo-upload.ts`

What to do:

- Extend technician job payloads to include PM events as a distinct job type.
- Update schedule UI to show PM jobs alongside ticket jobs with clear type labels.
- Add PM event detail screen or detail panel:
  - product identity
  - customer/site details safe for technician
  - customer/site details prefilled from the latest completed installation report where available
  - due date and scheduled date
  - checklist
  - calibration readings, when event type is calibration
  - remarks
  - photos
  - customer acknowledgement block, if required
- Add APIs:
  - start PM event
  - complete PM event
  - upload/attach photos
  - capture customer acknowledgement
- On completion:
  - set status to `completed`
  - set `completedAt`
  - persist checklist/readings/remarks/photos/acknowledgement
  - optionally auto-generate the next interval event for interval-based recurring plans, if the plan's cadence calls for rolling generation
- For installation-driven PM acknowledgement:
  - use the latest completed installation report for the asset as the primary source for customer name, phone, email, and site address
  - if no installation report exists, fall back to product/customer contact fields
  - if product/customer contact fields are missing, fall back to sale registration or dispatch metadata
  - allow manual customer detail entry only as a last resort, and mark the acknowledgement source as `manual`
  - store typed customer name and typed customer phone with the source customer name/phone, source type, match result, timestamp, technician ID, and PM event ID

Validation strategy:

- Technician with assigned PM sees event in schedule.
- Technician without assignment cannot access event.
- Completion requires required checklist items.
- Calibration readings are required only when configured.
- Customer acknowledgement is required only when configured.
- Completed PM appears in customer-visible history in later phases.

Risks / fallbacks:

- Risk: existing technician APIs assume every job is a ticket.
  - Introduce discriminated union types like `{ jobType: "ticket" | "preventive_maintenance" }`.
- Risk: completion form duplicates ticket completion logic.
  - Reuse UI primitives and photo helpers, but keep PM completion data separate.
- Risk: customer acknowledgement can block field completion in poor network conditions.
  - Store acknowledgement payload locally only if existing PWA offline patterns already support it; otherwise keep online-only for first release.

### Phase 5: Customer Dashboard And My Products PM Visibility

Files to read before starting:

- `src/app/(dashboard)/dashboard/customer/page.tsx`
- `src/app/(dashboard)/dashboard/my-products/page.tsx`
- `src/app/(dashboard)/dashboard/my-tickets/page.tsx`
- `src/app/(dashboard)/dashboard/my-tickets/[id]/page.tsx`
- `src/components/customer/register-product-card.tsx`
- `src/lib/customer-context.ts`
- `src/lib/preventive-maintenance.ts`

What to do:

- Update customer dashboard data loading to fetch PM events for customer-owned assets using the same verified phone/email/customer ID ownership rules as products and tickets.
- Add dashboard cards:
  - Upcoming PM
  - Overdue PM
  - Completed PM History
- Keep PM history separate from complaint ticket history, but visually near service history.
- Update My Products page:
  - show next PM event per product
  - show PM status badge
  - show count of completed PM activities
  - link to product PM history filter/detail
- Add customer PM event detail route if needed:
  - `/dashboard/my-products/[id]/maintenance`
  - or integrate into existing product card flow if no product detail page exists yet
- Ensure customer-facing data excludes internal notes, raw ERP metadata, internal assignment notes, and private service-center operational fields.

Validation strategy:

- Customer with no PM events sees a clean empty state.
- Customer with upcoming PM sees due/scheduled date.
- Customer with overdue PM sees clear overdue warning.
- Customer with completed PM sees completion date, technician/service center if approved for customer display, checklist summary, remarks, and acknowledgement.
- Customer cannot access another customer's PM events by URL.

Risks / fallbacks:

- Risk: customer ownership is currently spread across product ID, verified phone, and verified email.
  - Reuse the exact filtering style from existing customer pages.
- Risk: exposing too much operational data.
  - Build customer-safe projection helpers and use them everywhere customer PM data is returned.
- Risk: dashboard becomes cluttered.
  - Show top 3 upcoming and top 3 recent completed activities with links to full views.

### Phase 6: QR/NFC Product Page PM Visibility

Files to read before starting:

- `src/app/nfc/[id]/page.tsx`
- `src/components/nfc/customer-product-view.tsx`
- `src/components/nfc/customer-ticket-tracker.tsx`
- `src/components/nfc/public-product-view.tsx`
- `src/components/nfc/types.tsx`
- `src/lib/nfc-i18n.ts`
- `src/lib/warranty-types.ts`
- `src/lib/preventive-maintenance.ts`

What to do:

- Extend NFC page data loading to fetch customer-safe PM event data for the scanned asset.
- Pass PM schedule/history into `CustomerProductView` for verified owners.
- Add customer-visible sections:
  - Next Preventive Maintenance
  - Overdue Maintenance
  - Completed PM Activities
- Keep unverified public view restricted:
  - do not show customer-specific PM schedule/history to strangers
  - optionally show a generic message that verified owners can view maintenance history after verification
- Add English/Hindi copy keys in `nfc-i18n.ts`.
- Update shared warranty/NFC types.

Validation strategy:

- Verified customer sees PM schedule/history on QR/NFC page.
- Anonymous viewer does not see private PM history.
- Existing open-ticket tracker behavior remains intact.
- Long PM remarks/checklist summaries do not break mobile layout.
- Hindi copy renders without missing labels.

Risks / fallbacks:

- Risk: current QR flow has different branches for anonymous, owner, technician, and manager roles.
  - Add PM data only to the verified customer product branch first.
- Risk: customer page already has many sections.
  - Use concise PM cards and collapse completed history after a small number of records if needed.

### Phase 7: PM History Unification And Reporting

Files to read before starting:

- `src/components/nfc/customer-product-view.tsx`
- `src/app/(dashboard)/dashboard/customer/page.tsx`
- `src/app/(dashboard)/dashboard/manufacturer/analytics/page.tsx`
- `src/app/(dashboard)/dashboard/service-center/analytics/page.tsx`
- `src/app/(dashboard)/dashboard/manufacturer/page.tsx`
- `src/app/(dashboard)/dashboard/service-center-overview/page.tsx`

What to do:

- Add lifecycle history projection helper that can combine:
  - installation completion
  - reactive service tickets
  - completed PM events
  - completed calibration events
  - part usage, where customer-safe
- Add manufacturer PM metrics:
  - due this month
  - overdue
  - completed this month
  - completion SLA
  - product models with highest overdue count
- Add service-center PM metrics:
  - assigned PM events
  - upcoming visits
  - overdue assigned visits
  - technician completion count
- Keep the customer-facing history concise and customer-safe.

Validation strategy:

- Metrics match direct database counts.
- Combined lifecycle history sorts correctly by event date.
- PM completion appears once and does not duplicate ticket history.
- Role-restricted analytics are not visible to customers.

Risks / fallbacks:

- Risk: unified history can become too generic.
  - Use a typed projection with explicit event kinds instead of stringly typed records.
- Risk: analytics scope can expand.
  - Keep first analytics pass to counts and overdue lists.

### Phase 8: Backfill, Demo Data, And Production Readiness

Files to read before starting:

- `scripts/seed-e2e.js`
- `scripts/run-e2e-api-tests.js`
- `prisma/schema.prisma`
- `vercel.json`
- `.env.example`
- existing e2e/dogfood outputs only if needed for test accounts and workflows

What to do:

- Add seed data for:
  - one product model with PM plan
  - one installed asset with upcoming PM
  - one installed asset with overdue PM
  - one installed asset with completed PM history
  - one calibration event if medical demo requires it
- Add an idempotent backfill script:
  - generate PM events for installed assets by organization/product model
  - skip assets without installation date
  - skip duplicate plan/asset/due date events
  - write a summary of generated/skipped/error counts
- Add PM checks to e2e API tests:
  - plan creation
  - event generation
  - assignment
  - technician completion
  - customer visibility
  - unauthorized access rejection
- Add operational notes to `.env.example` only if a new cron or env var is introduced.
- If adding an overdue sweep cron:
  - create a route to mark eligible due/scheduled events as overdue
  - wire it in `vercel.json`
  - ensure it is idempotent

Validation strategy:

- Run Prisma migration deploy locally or against a staging database.
- Run typecheck.
- Run lint.
- Run PM-specific tests.
- Run a manual demo path:
  - create PM plan
  - generate PM event
  - assign technician
  - technician completes PM
  - customer sees completed PM history in dashboard and QR/NFC page
- For production-affecting schema work, verify production migration state before declaring release complete.

Risks / fallbacks:

- Risk: generated PM events for old assets could be too noisy.
  - Backfill should support dry-run and scoped organization/product model flags.
- Risk: overdue sweep may produce surprising status changes.
  - Make overdue derivable in UI first, then persist overdue status only if needed for reporting/notifications.
- Risk: demo data can pollute production.
  - Keep seed/demo scripts environment-guarded.

## Sequenced Delivery Recommendation

Recommended implementation order:

1. Build schema and pure PM helpers.
2. Build PM plan/event APIs.
3. Wire event generation after installation completion.
4. Build manufacturer PM plan and event management UI.
5. Build technician PM schedule and completion.
6. Build customer dashboard/My Products PM visibility.
7. Build QR/NFC PM visibility.
8. Add reporting, backfill, and production hardening.

Reasoning:

- The data model must land first because customer visibility depends on real schedule and completion records.
- Admin/event generation must come before customer screens, otherwise customer screens have no reliable source.
- Technician completion must come before completed PM history, otherwise history is only theoretical.
- Customer QR/NFC visibility should come after the customer dashboard because it is the more sensitive privacy path.

## Acceptance Criteria

The feature is complete when:

- Manufacturer admin can configure PM/calibration plans for a product model.
- PM events are generated for installed assets based on active plans.
- Admin/service-center users can schedule and assign PM events.
- Technician can see assigned PM work, start it, and complete it with required checklist/readings/remarks/photos/acknowledgement.
- Customer dashboard shows upcoming, overdue, and completed PM activities for owned products.
- My Products shows next PM status per product.
- Verified customer QR/NFC product page shows next PM and completed PM history.
- Anonymous QR/NFC viewers cannot see private PM schedule/history.
- Completed PM events remain attached to the exact serialized asset.
- PM records are separate from complaint tickets but can be shown together in a lifecycle history.
- Tests cover permissions, generation, completion, and customer visibility.

## Approved Decisions

The user approved these defaults on 2026-07-27:

- Include both `preventive_maintenance` and `calibration` in schema from day one.
- Generate PM events upfront for the active warranty period when warranty end date is known.
- If warranty end date is not known, generate only the next two PM events.
- Treat upfront-generated PM events as the machine-level maintenance calendar for a given equipment.
- Do not add customer rescheduling in v1; show the schedule/history and route changes through service-center/admin operations.
- Use typed customer name/phone acknowledgement in v1.
- For installation-driven maintenance, prefill acknowledgement customer details from the latest completed installation report for the asset.
- If no installation report exists, fall back to product/customer contact fields, then sale registration or dispatch metadata, then manual entry.
- Store acknowledgement source and match details, including whether the typed phone matches the installation-report/customer source phone.
- Calculate overdue dynamically in query helpers first; add a persisted overdue sweep only if reporting or notification requirements demand it.

## Remaining Open Decisions Before Implementation

These decisions should still be confirmed before coding:

- Should PM calendar dates be generated exactly from installation date, or should manufacturers be able to choose a preferred day/window in the due month?
- For warranty-period upfront generation, should events due exactly on warranty end date be included or excluded?
- Should completed PM history show technician name to customers by default, or only service-center/manufacturer name?
- Should PM reminders/notifications be included in v1 or deferred until the schedule/history workflow is stable?
