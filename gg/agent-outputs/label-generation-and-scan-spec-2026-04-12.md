# Implementation Specification: Installation-Driven Warranty Lifecycle

Date: 2026-04-12
Target repo: `warranty.feedbacknfc.com`
Document type: implementation specification
Status: ready for engineering execution

## 1. Purpose

This spec replaces the earlier label-only framing.

The scope is now the full installation-driven product needed by the business:

- manufacturer-managed asset identity
- assisted sale registration
- installation job creation and dispatch
- installer mobile workflow
- activation only after verified installation
- customer handoff after installation
- later service and claim flows
- labels and scan resolution as one subsystem inside that broader lifecycle

The goal is to make installation-driven manufacturers a first-class product shape, instead of forcing them into the current point-of-sale activation model.

## 2. Product Outcome

Ship a workflow where:

1. Manufacturer defines which product models are installation-driven.
2. A carton scan or assisted registration captures sale and owner intent, but does not activate warranty.
3. The platform creates an installation job.
4. A service center or installer technician gets the job in the existing mobile/PWA workflow.
5. The installer verifies the unit on site, completes checklist and commissioning capture, logs any installed kit/spares, and completes the job.
6. Warranty activates only after successful installation completion.
7. The unit’s service tag becomes the customer’s long-term support entrypoint.

## 3. Why The Current System Is Insufficient

The current implementation is optimized for plug-and-play activation:

- carton QR or unit scan can lead directly to `/api/warranty/activate`
- `Product` stores customer ownership and installation date together
- `Ticket` is the only structured field-work object
- there is no sale-registration state separate from activation
- there is no first-class installation job, installer checklist, or commissioning record
- the unit tag model assumes the same public entrypoint can serve pre-install and post-install customer states with only minor branching

That model breaks for installation-driven products because:

- sale and installation are separate events
- installation may be delayed by days
- installers need assignment, scheduling, and on-site execution state
- the customer should not get an active warranty before installation is completed
- installation may consume kits, spares, and small parts that must be traceable

## 4. Architecture Decisions

### 4.1 Installation Is A First-Class Workflow

Do not implement installation-driven behavior as a small branch inside `warranty/activate`.

Installation must be modeled explicitly with its own job lifecycle.

### 4.2 Reuse Existing Service Network Roles In V1

Do not introduce a new auth role called `installer` in v1.

Reuse the existing service network stack:

- `service_center_admin`
- `technician`

Interpret `technician` as a field operative who can do:

- installation
- warranty service
- future maintenance

This keeps the current auth, PWA install, mobile job board, and dispatch surfaces reusable.

### 4.3 Installation Should Not Be Forced Into `Ticket`

Do not reuse `Ticket` for installation.

Reason:

- `Ticket` is issue-led and customer-initiated
- installation is sale-led and operationally scheduled
- installation has checklist and commissioning requirements that do not belong on issue tickets

Recommended model:

- keep `Ticket` for after-sales problems
- add `InstallationJob` for installation work

### 4.4 Labels Are A Subsystem, Not The Product Scope

Tags and labels still matter, but they exist to support:

- sale registration
- installer verification
- customer handoff
- later service entry

The implementation should not be driven by label types first. It should be driven by the installation lifecycle.

### 4.5 Move To Generic Asset And Tag Identity

The current `Sticker` and `Product` runtime model is too narrow.

The installation-driven scope should adopt:

- `AssetIdentity` for the real unit or component
- `AssetTag` for the scannable surface

That model supports:

- main products
- installation kits
- spares
- small parts
- packs

without more special cases.

## 5. Scope

### In Scope

- product model settings for installation-driven behavior
- asset and tag generation
- carton sale registration flow
- installation queue and assignment
- installer mobile flow
- checklist and commissioning capture
- activation on completion
- structured kit/spare usage during installation
- service handoff after installation
- generic scan resolution before and after install

### Out Of Scope

- retailer-specific login role in v1
- external scheduling calendar sync
- ERP bidirectional sync
- warehouse operations beyond pack and kit traceability
- advanced SLA optimization for installation routing

## 6. Current Codebase Surfaces To Change

### Existing Activation And Scan Flow

- `src/app/nfc/[id]/page.tsx`
- `src/app/q/[id]/page.tsx`
- `src/app/c/[id]/page.tsx`
- `src/app/api/warranty/activate/route.ts`
- `src/components/nfc/warranty-activation.tsx`
- `src/lib/sticker-config.ts`
- `src/lib/sticker-number.ts`
- `src/lib/scan-log.ts`

### Existing Manufacturer Admin

- `src/app/(dashboard)/dashboard/manufacturer/products/page.tsx`
- `src/components/manufacturer/product-models-client.tsx`
- `src/app/(dashboard)/dashboard/manufacturer/stickers/page.tsx`
- `src/components/manufacturer/sticker-wizard-client.tsx`
- `src/app/api/manufacturer/product-model/route.ts`
- `src/app/api/manufacturer/product-model/[id]/route.ts`
- `src/app/api/manufacturer/settings/route.ts`
- `src/components/manufacturer/settings-client.tsx`
- `src/app/api/manufacturer/allocate/route.ts`
- `src/app/api/manufacturer/stickers/generate-qr/route.ts`
- `src/app/api/manufacturer/stickers/generate-nfc-encoding/route.ts`

### Existing Service Network And Mobile

- `src/app/(dashboard)/dashboard/manufacturer/service-network/page.tsx`
- `src/components/manufacturer/service-network-client.tsx`
- `src/app/api/manufacturer/service-center/route.ts`
- `src/app/api/service-center/install-invite/route.ts`
- `src/lib/install-app-invite.ts`
- `src/app/install-app/page.tsx`
- `src/components/pwa/install-app-client.tsx`
- `src/components/pwa/send-install-invite-button.tsx`
- `src/app/api/technician/jobs/route.ts`
- `src/components/technician/job-detail.tsx`

### Existing Service Workflow

- `src/app/api/ticket/create/route.ts`
- `src/app/api/ticket/[id]/start/route.ts`
- `src/app/api/ticket/[id]/complete/route.ts`
- `src/app/api/ticket/[id]/confirm/route.ts`
- `src/components/nfc/staff-sticker-views.tsx`
- `src/app/api/manufacturer/claims/route.ts`
- `src/app/api/claim/[id]/report/route.ts`

### Prisma

- `prisma/schema.prisma`

## 7. End-To-End User Journey

## 7.1 Manufacturer Setup

Manufacturer admin:

1. creates product model
2. marks it as `installation_driven`
3. configures installation checklist and commissioning fields
4. chooses unit tag and carton tag policies
5. generates assets and tags

## 7.2 Sale Registration

At sale or dispatch:

1. carton tag is scanned or serial is entered manually
2. customer name, phone, address, and purchase date are captured
3. system creates a sale registration record
4. asset moves to `sold_pending_installation`
5. warranty does not activate yet

## 7.3 Installation Job Creation

Once sale registration is complete:

1. system creates an `InstallationJob`
2. manufacturer admin or service center admin assigns a service center
3. job is assigned to a technician
4. technician receives the job through the existing install/PWA surfaces

## 7.4 On-Site Installation

Installer technician:

1. opens the job on phone
2. scans the unit tag to verify physical unit identity
3. captures address or GPS verification
4. completes checklist
5. captures commissioning values
6. logs installed kit, spare, or batch part usage if required
7. uploads photos
8. completes installation

## 7.5 Activation And Customer Handoff

On successful completion:

1. asset ownership is finalized
2. warranty activates
3. certificate becomes available
4. customer receives confirmation SMS or email
5. unit service tag becomes the long-term support entrypoint

## 7.6 Post-Install Service

After installation:

- owner can scan the service tag and create warranty tickets
- service technicians can use structured part linkage for future repairs
- claims derive from structured usage rows

## 8. Domain Model

## 8.1 Extend `ProductModel`

Add these fields:

| Field | Type | Notes |
| --- | --- | --- |
| `activationMode` | enum | `plug_and_play` or `installation_driven` |
| `installationRequired` | boolean | convenience mirror of mode |
| `allowCartonSaleRegistration` | boolean | carton tag may register sale |
| `allowUnitSelfActivation` | boolean | false for installation-driven |
| `installationChecklistTemplate` | `Json` | list of tasks and capture requirements |
| `commissioningTemplate` | `Json` | readings and validations |
| `defaultInstallerSkillTags` | `String[]` | installer matching hints |
| `includedKitDefinition` | `Json` | optional install kit composition |
| `productClass` | enum | still needed for broader asset model |

New enum:

- `ActivationMode`
  - `plug_and_play`
  - `installation_driven`

Rule:

- if `activationMode = installation_driven`, `allowUnitSelfActivation` must be false

## 8.2 Replace `Product` With `AssetIdentity`

Add `AssetIdentity`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `publicCode` | string unique | canonical asset identifier |
| `organizationId` | UUID | manufacturer |
| `productModelId` | UUID | |
| `productClass` | enum | `main_product`, `spare_part`, `small_part`, `kit`, `pack` |
| `serialNumber` | string nullable | |
| `batchCode` | string nullable | |
| `lifecycleState` | enum | includes installation states |
| `warrantyState` | enum nullable | finished goods only |
| `customerId` | UUID nullable | owner |
| `customerName` | string nullable | |
| `customerPhone` | string nullable | |
| `customerEmail` | string nullable | |
| `installationDate` | datetime nullable | |
| `installationLocation` | `Json` nullable | |
| `rootMainAssetId` | UUID nullable | for kits, parts, and pack members |
| `metadata` | `Json` | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

`AssetLifecycleState`:

- `generated`
- `packed`
- `sold_pending_installation`
- `installation_scheduled`
- `installation_in_progress`
- `active`
- `consumed`
- `retired`
- `voided`

## 8.3 Replace `Sticker` With `AssetTag`

Add `AssetTag`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `publicCode` | string unique | resolver code |
| `assetId` | UUID | |
| `tagClass` | enum | `unit_service`, `carton_registration`, `component_unit`, `small_part_batch`, `kit_parent`, `pack_parent` |
| `symbology` | enum | `qr`, `data_matrix`, `nfc_uri` |
| `status` | enum | `generated`, `printed`, `encoded`, `active`, `voided` |
| `materialVariant` | enum | `standard`, `high_temp`, `premium` |
| `printSizeMm` | int nullable | |
| `encodedValue` | string | exact payload |
| `viewerPolicy` | enum | `public`, `owner_only`, `technician_admin`, `warehouse_admin` |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

The carton tag class is renamed from the earlier document:

- use `carton_registration`

because the key behavior for installation-driven products is sale registration, not activation.

## 8.4 Replace `StickerAllocation` With `TagGenerationBatch`

Add `TagGenerationBatch`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `organizationId` | UUID | |
| `productModelId` | UUID | |
| `quantity` | int | |
| `serialPrefix` | string nullable | |
| `serialStart` | string nullable | |
| `serialEnd` | string nullable | |
| `includeCartonRegistrationTags` | boolean | main product only |
| `defaultSymbology` | enum | |
| `outputProfile` | `Json` | |
| `createdById` | UUID | |
| `createdAt` | datetime | |

## 8.5 Add `SaleRegistration`

Add `SaleRegistration`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `assetId` | UUID | required |
| `organizationId` | UUID | manufacturer |
| `channel` | enum | `carton_scan`, `manual_admin`, `api_import`, `salesman_assisted` |
| `purchaseDate` | datetime nullable | |
| `registeredAt` | datetime | |
| `registeredByUserId` | UUID nullable | if assisted by logged-in staff |
| `customerName` | string | |
| `customerPhone` | string | |
| `customerEmail` | string nullable | |
| `installAddress` | string nullable | |
| `installCity` | string nullable | |
| `installState` | string nullable | |
| `installPincode` | string nullable | |
| `status` | enum | `registered`, `job_created`, `cancelled` |
| `metadata` | `Json` | dealer, remarks, source details |

## 8.6 Add `InstallationJob`

Add `InstallationJob`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `jobNumber` | string unique | |
| `assetId` | UUID | required |
| `saleRegistrationId` | UUID nullable | |
| `manufacturerOrgId` | UUID | |
| `assignedServiceCenterId` | UUID nullable | |
| `assignedTechnicianId` | UUID nullable | |
| `status` | enum | lifecycle below |
| `requestedAt` | datetime | |
| `scheduledFor` | datetime nullable | |
| `technicianStartedAt` | datetime nullable | |
| `technicianCompletedAt` | datetime nullable | |
| `activationTriggeredAt` | datetime nullable | |
| `checklistTemplateSnapshot` | `Json` | snapshot from model |
| `checklistResponses` | `Json` | booleans, notes, per-step data |
| `commissioningTemplateSnapshot` | `Json` | snapshot from model |
| `commissioningData` | `Json` | measurements and result |
| `beforePhotos` | `String[]` | |
| `afterPhotos` | `String[]` | |
| `resolutionNotes` | string nullable | installer notes |
| `metadata` | `Json` | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

`InstallationJobStatus`:

- `pending_assignment`
- `assigned`
- `scheduled`
- `technician_enroute`
- `on_site`
- `commissioning`
- `completed`
- `customer_confirmed`
- `cancelled`
- `failed`

## 8.7 Add `JobPartUsage`

The previous document used `ServicePartUsage`. That is too narrow for installation-driven scope.

Use `JobPartUsage` instead:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `installationJobId` | UUID nullable | |
| `ticketId` | UUID nullable | |
| `mainAssetId` | UUID | required |
| `usedAssetId` | UUID nullable | tagged spare or kit |
| `usedTagId` | UUID nullable | exact scan surface |
| `productModelId` | UUID | denormalized |
| `usageType` | enum | `installed`, `consumed`, `returned_unused`, `removed` |
| `quantity` | decimal | |
| `unitCost` | decimal | |
| `lineTotal` | decimal | |
| `claimable` | boolean | |
| `linkedByUserId` | UUID | |
| `linkedAt` | datetime | |
| `metadata` | `Json` | |

Constraint:

- one of `installationJobId` or `ticketId` must be present
- both cannot be null

## 8.8 Add `TagScanEvent`

Add `TagScanEvent`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `tagId` | UUID | |
| `assetId` | UUID | |
| `organizationId` | UUID | |
| `scanSource` | enum | `qr`, `data_matrix`, `nfc`, `manual`, `unknown` |
| `viewerType` | enum | `public`, `owner_verified`, `owner_session`, `technician`, `admin`, `salesman_assisted`, `warehouse` |
| `resolvedView` | enum | `sale_registration`, `installation_pending`, `installation_job`, `activation_complete`, `customer_product`, `ticket_view`, `not_allowed`, `not_found` |
| `installationJobId` | UUID nullable | if within job context |
| `ticketId` | UUID nullable | if within service context |
| `userId` | UUID nullable | |
| `ipAddress` | string nullable | |
| `userAgent` | string nullable | |
| `createdAt` | datetime | |

## 9. Public Scan And Resolver Design

## 9.1 New Resolver

Add:

- `src/app/r/[code]/page.tsx`

All new generated tags must point to:

- `https://warranty.feedbacknfc.com/r/{tagPublicCode}`

## 9.2 Remove Old Public Entry Surfaces

Replace:

- `/nfc/[id]`
- `/q/[id]`
- `/c/[id]`

with one generic resolver.

Delete:

- `src/lib/sticker-number.ts`
- `src/app/api/sticker/lookup/route.ts`

## 9.3 Resolver Behavior By Asset State

### Carton Registration Tag

If `activationMode = installation_driven`:

- open sale registration flow
- do not activate warranty

If `activationMode = plug_and_play`:

- carton scan may still trigger immediate activation flow

### Unit Service Tag Before Installation

If asset state is `sold_pending_installation` or `installation_scheduled`:

- public user sees installation-pending view
- authenticated technician with matching job sees installation job view
- owner cannot raise warranty service ticket yet

### Unit Service Tag After Installation

If asset state is `active`:

- same role-aware customer and technician service experience as current product flow

### Component Or Kit Tag

- not customer-facing
- if scanned inside installation job, create or update `JobPartUsage`
- if scanned outside job context, show technician/admin-only part information

## 10. UI And Navigation Changes

## 10.1 Role Navigation

Update `src/lib/roles.ts`.

Changes:

- manufacturer admin:
  - add `Installations`
- service center admin:
  - add `Installations`
- technician:
  - rename `My Jobs` to `My Work`
  - support install and service filters

No new role is added in v1.

## 10.2 Manufacturer Dashboard

Add page:

- `src/app/(dashboard)/dashboard/manufacturer/installations/page.tsx`

Purpose:

- pending sale registrations
- installation jobs
- assignment exceptions
- activation conversion metrics

## 10.3 Service Center Dashboard

Add page:

- `src/app/dashboard/installations/page.tsx`

Purpose:

- installation queue
- unassigned jobs
- scheduled jobs
- completed today

## 10.4 Technician Mobile Experience

Reuse the existing PWA and technician mobile shell.

Files to update:

- `src/app/api/technician/jobs/route.ts`
- `src/components/technician/job-detail.tsx`
- technician pages under dashboard

Add install job support:

- job type badge: `installation` or `service`
- installation checklist section
- commissioning section
- part and kit usage section
- complete installation action

## 10.5 Public Components

Add or replace public scan components:

- `sale-registration-form.tsx`
- `installation-pending-view.tsx`
- `installation-complete-view.tsx`

Replace or heavily refactor current `warranty-activation.tsx`.

## 11. API Plan

## 11.1 Product Model And Settings

Update:

- `POST /api/manufacturer/product-model`
- `PUT /api/manufacturer/product-model/[id]`
- `PUT /api/manufacturer/settings`

to accept installation-driven fields and validation.

## 11.2 Asset And Tag Generation

Replace current allocation API with:

- `POST /api/manufacturer/tag-batches`
- `GET /api/manufacturer/tag-batches`
- `GET /api/manufacturer/tag-batches/[id]`
- `POST /api/manufacturer/tag-batches/validate`

Exports:

- `GET /api/manufacturer/tag-batches/[id]/exports/qr`
- `GET /api/manufacturer/tag-batches/[id]/exports/data-matrix`
- `GET /api/manufacturer/tag-batches/[id]/exports/nfc`
- `GET /api/manufacturer/tag-batches/[id]/exports/manifest`

## 11.3 Sale Registration

Add:

- `POST /api/sale-registrations`
- `GET /api/manufacturer/sale-registrations`
- `POST /api/manufacturer/sale-registrations/[id]/create-installation-job`

`POST /api/sale-registrations` request:

```json
{
  "tagCode": "TG01...",
  "customerName": "Priya Shah",
  "customerPhone": "+919999999999",
  "customerEmail": "priya@example.com",
  "purchaseDate": "2026-04-12",
  "installAddress": "12 MG Road",
  "installCity": "Bengaluru",
  "installState": "Karnataka",
  "installPincode": "560001"
}
```

Behavior:

- resolve tag and asset
- verify asset is installation-driven main product
- create `SaleRegistration`
- move asset to `sold_pending_installation`

## 11.4 Installation Jobs

Add:

- `POST /api/installations`
- `GET /api/installations`
- `GET /api/installations/[id]`
- `POST /api/installations/[id]/assign`
- `POST /api/installations/[id]/schedule`
- `POST /api/installations/[id]/start`
- `POST /api/installations/[id]/complete`
- `POST /api/installations/[id]/confirm`

`POST /api/installations/[id]/complete` must:

- validate checklist completion
- validate required commissioning fields
- validate required photos
- validate required kit/spare usage scans if model policy requires it
- write installation completion
- activate warranty
- update asset owner and installation metadata

## 11.5 Job Part Usage

Add:

- `POST /api/installations/[id]/part-usage/scan`
- `POST /api/installations/[id]/part-usage`
- `DELETE /api/installations/[id]/part-usage/[usageId]`
- equivalent service ticket endpoints may share the same handler later

## 11.6 Service Ticket Guardrails

Update:

- `POST /api/ticket/create`

Rule:

- if asset `activationMode = installation_driven` and asset lifecycle is not `active`, reject service ticket creation

## 12. Installation Checklist And Commissioning

## 12.1 Template Shape

Store checklist and commissioning templates on `ProductModel` as JSON in v1.

Example checklist item types:

- boolean pass or fail
- required photo
- free text note
- select option

Example commissioning field types:

- numeric reading
- min/max validation
- required serial match
- required geo capture

## 12.2 Execution Rules

For each installation job:

- copy the template from `ProductModel` into snapshot JSON on the job
- never read live templates while completing an existing job
- record responses on the job snapshot only

This prevents late catalog edits from mutating in-flight job requirements.

## 13. Labels And Scan Rules Inside Installation-Driven Scope

Labels remain required, but their behavior changes.

### Carton Tag

Use for:

- sale registration
- install scheduling bootstrap

Do not use it to activate warranty for installation-driven assets.

### Unit Tag

Use for:

- installer unit verification on site
- customer support after installation

Pre-install public behavior:

- show pending installation

Post-install public behavior:

- show customer product and service entry

### Component And Kit Tags

Use for:

- installation kit verification
- spare or small-part traceability
- future service jobs

### Symbology

- main product customer-facing tags: QR by default
- premium main product: optional NFC + QR
- spares and small parts: Data Matrix default

## 14. Validation Rules

### Product Model

- `activationMode = installation_driven` requires `installationRequired = true`
- installation-driven model cannot allow unit self-activation
- installation-driven model must have a non-empty checklist template

### Sale Registration

- one main asset cannot have two active sale registrations
- one asset already `active` cannot be sale-registered again
- carton registration tag only valid for `main_product`

### Installation Job

- one active installation job per asset
- cannot start installation without assigned technician
- cannot complete installation without required checklist responses
- cannot complete installation without required commissioning values
- cannot complete installation without required photos

### Activation

- warranty activation for installation-driven assets can only happen from installation completion
- direct calls to old self-activation route must be rejected for installation-driven assets

### Part Usage

- required install kit scans block completion if policy demands them
- same individually tracked spare cannot be installed on two active assets
- batch or small-part usage requires quantity

### Service

- pre-install asset cannot create warranty service ticket
- post-install asset can create normal service ticket

## 15. Migration Strategy

Use a staged migration with one end-state runtime.

### Phase 1: Schema Additions

Add:

- `ActivationMode`
- `AssetIdentity`
- `AssetTag`
- `TagGenerationBatch`
- `SaleRegistration`
- `InstallationJob`
- `JobPartUsage`
- `TagScanEvent`

Do not delete legacy models yet.

### Phase 2: Backfill Existing Finished Goods

Backfill:

- existing `ProductModel` rows to `activationMode = plug_and_play`
- existing `Product` rows into `AssetIdentity`
- existing `Sticker` rows into `AssetTag`

### Phase 3: Switch New Generation To Asset/Tag Model

After this phase:

- no new `Sticker` or `Product` rows should be created by generation flows

### Phase 4: Launch Installation-Driven Models

Launch for selected manufacturers only:

- sale registration
- installation jobs
- activation on completion

### Phase 5: Cut Over Public Resolver

Replace `nfc/q/c` route families with `/r/[code]`.

### Phase 6: Remove Legacy Runtime

Delete:

- `Sticker`
- `Product`
- `StickerAllocation`
- `StickerScanEvent`
- `ScanLog`

## 16. Engineering Phases

## Phase A: Data And Settings

Files:

- `prisma/schema.prisma`
- manufacturer product model APIs and UI
- manufacturer settings APIs and UI

Deliverable:

- installation-driven product models can be configured

## Phase B: Asset And Tag Generation

Files:

- current sticker generation page and APIs
- QR and NFC export routes
- new Data Matrix export

Deliverable:

- manufacturer can generate installation-driven unit and carton tags

## Phase C: Sale Registration And Installation Queue

Files:

- new sale registration APIs
- new manufacturer and service center installation dashboard pages
- navigation updates

Deliverable:

- carton registration creates install-ready assets and jobs

## Phase D: Installer Mobile Workflow

Files:

- technician jobs API
- technician job detail UI
- install-app flow reuse

Deliverable:

- field operative can execute install jobs on mobile

## Phase E: Activation And Customer Handoff

Files:

- new resolver
- activation logic
- public install-pending and install-complete views

Deliverable:

- activation happens only on successful install completion

## Phase F: Service And Claims Integration

Files:

- ticket creation guardrails
- job part usage
- claims and report generation

Deliverable:

- installed products transition cleanly into later warranty service

## 17. Test Plan

## 17.1 Integration Tests

- installation-driven carton scan creates sale registration only
- no warranty activation before job completion
- installation job can be assigned to technician
- technician can start and complete installation
- completion activates warranty and writes certificate metadata
- service ticket creation fails before installation is complete
- service ticket creation succeeds after activation

## 17.2 E2E Tests

- manufacturer creates installation-driven product model
- manufacturer generates unit plus carton tags
- customer or salesman registers sale
- service center sees installation job
- technician completes installation on mobile
- customer scans unit tag after install and reaches service-capable view

## 17.3 Regression Checks

- plug-and-play models still support current activation behavior
- service center PWA install invite still works
- technician live tracking still works for service jobs
- manufacturer service network pages still load

## 18. Acceptance Criteria

The installation-driven approach is shipped when:

1. Manufacturer can configure a product model as installation-driven.
2. Carton scan registers sale without activating warranty.
3. Installation job is created and visible to manufacturer and service center users.
4. Technician can complete installation using the current mobile/PWA stack.
5. Warranty activates only after checklist and commissioning completion.
6. Unit tag shows install-pending state before install and normal service entry after install.
7. Job-level kit and spare usage can be linked during installation.
8. Pre-install service ticket creation is blocked.
9. Post-install service and claims continue to work.

## 19. Recommended Build Order

Build in this order:

1. data model and settings
2. asset and tag generation
3. sale registration
4. installation queue and assignment
5. installer mobile flow
6. activation on completion
7. service and claims integration
8. public resolver cutover
9. legacy cleanup

## 20. Summary

The right scope is not “better label spec”.

The right scope is:

- an installation-driven warranty lifecycle
- with labels, scans, and asset identity as enabling infrastructure

The implementation should therefore ship:

- explicit sale registration
- explicit installation jobs
- activation on verified installation completion
- reuse of the current service network and technician mobile stack
- generic asset and tag identity
- clean handoff from installation to warranty service

That is the minimum product scope required to support installation-driven manufacturers in this codebase.
