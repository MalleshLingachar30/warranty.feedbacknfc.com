# Generic Activation And Installation Platform Specification

Date: 2026-04-13
Target repo: `warranty.feedbacknfc.com`
Document type: implementation specification
Status: ready for engineering execution

## 1. Purpose

This document replaces the prospect-shaped framing with a generic platform model that can support:

- boxed plug-and-play products
- installation-driven products
- capital goods installed only by manufacturer engineers
- dealer-installed products
- serialized spares
- small parts that require pack-level or kit-level traceability

The goal is to build one configurable post-sales platform, not a one-off flow for a single manufacturer.

## 2. Product Outcome

Ship a configurable platform where:

1. Manufacturer admin chooses whether each product model is `plug_and_play` or `installation_driven`.
2. Manufacturer admin configures who is allowed to install and activate each installation-driven model.
3. Manufacturer admin generates canonical item identities and printable tags for main products, spares, kits, packs, and small parts.
4. ERP imports seed the master data and serialized sales lines needed to start the downstream workflow.
5. Installation-driven products activate warranty only when the digital installation report is submitted with all required proof.
6. Plug-and-play products retain the current lighter activation flow.
7. Spares, kits, and small parts are linked to a main product only when actually used in installation or service against a real work object.

## 3. Core Product Principle

Do not build two separate products.

Build one common platform with:

- shared identity and scan infrastructure
- shared ticket and service infrastructure
- shared part-usage and acknowledgement infrastructure
- a configurable activation policy layer

The configuration layer decides whether a model behaves as:

- `plug_and_play`
- `installation_driven`

## 4. Product Modes

## 4.1 Plug-And-Play

Use for products where sale, ownership capture, and activation can happen close to customer handoff.

Characteristics:

- customer-led or assisted activation
- no mandatory installation job
- no mandatory installation report
- current activation flow largely remains

## 4.2 Installation-Driven

Use for products where installation or commissioning is the true activation event.

Characteristics:

- sale and installation are separate events
- end customer is often unknown at dispatch
- installation report is mandatory
- warranty activates immediately on valid installation report submission
- service is allowed only after installation activation
- part linkage is mandatory for all required install kits and spares

## 5. Generic Configuration Model

Settings should be controlled by manufacturer admin, with product-model overrides.

## 5.1 Manufacturer Default Settings

Add manufacturer-level defaults:

| Field | Type | Allowed Values | Notes |
| --- | --- | --- | --- |
| `defaultActivationMode` | enum | `plug_and_play`, `installation_driven` | default for new models |
| `defaultCustomerCreationMode` | enum | `on_activation`, `on_installation` | installation-driven should default to `on_installation` |
| `defaultPartTraceabilityMode` | enum | `none`, `pack_or_kit`, `unit_scan_mandatory` | |
| `defaultAcknowledgementRequired` | boolean | `true`, `false` | |
| `erpInboundEnabled` | boolean | `true`, `false` | phase 1 should support inbound |
| `erpOutboundEnabled` | boolean | `true`, `false` | phase 1 default false |

## 5.2 Product Model Policy Settings

Extend `ProductModel` with policy fields:

| Field | Type | Allowed Values | Notes |
| --- | --- | --- | --- |
| `activationMode` | enum | `plug_and_play`, `installation_driven` | top-level behavior switch |
| `installationOwnershipMode` | enum | `manufacturer_only`, `dealer_allowed` | controls who can submit installation report |
| `installationRequired` | boolean | | mirror of installation-driven mode |
| `activationTrigger` | enum | `self_activation`, `installation_report_submission` | phase 1 uses these two values |
| `customerCreationMode` | enum | `on_activation`, `on_installation` | installation-driven should use `on_installation` |
| `allowCartonSaleRegistration` | boolean | | carton scan allowed for pre-install registration |
| `allowUnitSelfActivation` | boolean | | false for installation-driven |
| `partTraceabilityMode` | enum | `none`, `pack_or_kit`, `unit_scan_mandatory` | installation-driven phase 1 uses mandatory traceability |
| `smallPartTrackingMode` | enum | `individual`, `pack_level`, `kit_level`, `pack_or_kit` | use `pack_or_kit` where needed |
| `customerAcknowledgementRequired` | boolean | | must be true for installation-driven phase 1 |
| `installationChecklistTemplate` | `Json` | | |
| `commissioningTemplate` | `Json` | | |
| `requiredPhotoPolicy` | `Json` | | before/after or other proof requirements |
| `requiredGeoCapture` | boolean | | |
| `defaultInstallerSkillTags` | `String[]` | | assignment hints |
| `includedKitDefinition` | `Json` | | optional install kit composition |

## 5.3 Required Rules

- if `activationMode = installation_driven`, then `installationRequired = true`
- if `activationMode = installation_driven`, then `allowUnitSelfActivation = false`
- if `activationMode = installation_driven`, then `activationTrigger = installation_report_submission`
- if `activationMode = installation_driven`, then `customerCreationMode = on_installation`
- if `activationMode = installation_driven`, then `customerAcknowledgementRequired = true`
- if `activationMode = installation_driven`, then `partTraceabilityMode` cannot be `none`
- if `installationOwnershipMode = manufacturer_only`, only manufacturer service engineers can submit installation reports
- if `installationOwnershipMode = dealer_allowed`, dealer engineers or dealer service technicians can submit installation reports

## 6. Business Rules Confirmed For The Current Target Shape

These are not hardcoded to a single prospect. They are valid policy values inside the generic framework.

### 6.1 Capital Goods

- `activationMode = installation_driven`
- `installationOwnershipMode = manufacturer_only`
- installation and signoff handled by manufacturer service engineer
- warranty activates on valid installation report submission

### 6.2 Other Installation-Driven Items

- `activationMode = installation_driven`
- `installationOwnershipMode = dealer_allowed`
- dealer engineer or dealer service technician submits installation report
- warranty activates on valid installation report submission

### 6.3 Plug-And-Play Products

- `activationMode = plug_and_play`
- current activation flow remains available

## 7. Item And Tag Coverage

## 7.1 Item Classes

Support these item classes:

- `main_product`
- `spare_part`
- `small_part`
- `kit`
- `pack`

## 7.2 Tagging Classes

Support these tag classes:

- `unit_service`
- `carton_registration`
- `component_unit`
- `small_part_batch`
- `kit_parent`
- `pack_parent`

## 7.3 Symbology Policy

Symbology is a rendering choice, not a business object.

Recommended defaults:

- main product customer-facing tags: `qr`
- premium main product: `qr` plus optional `nfc_uri`
- normal spares: `qr` or `data_matrix`
- small spares and small parts: `data_matrix`
- tiny parts: `pack_level` or `kit_level` traceability with `data_matrix`

## 7.4 Label Size Guidance

For Data Matrix:

- minimum module size target: `0.255 mm`
- recommended module size target: `0.300 mm`
- absolute lower practical field target: about `5 to 6 mm` square overall
- safer mobile field target: `8 to 10 mm` square overall

Use pack-level or kit-level tracking when individual labels would be too small or unreliable.

## 8. Canonical Identity Model

Do not create separate business identities for QR and Data Matrix.

The system should create one canonical item identity and then render it through one or more tag formats.

Recommended entities:

- `AssetIdentity`
- `AssetTag`
- `TagGenerationBatch`
- `SaleRegistration`
- `InstallationJob`
- `InstallationReport`
- `JobPartUsage`
- `TagScanEvent`

## 9. Domain Model

## 9.1 `AssetIdentity`

Use one asset table for:

- finished goods
- spares
- small parts
- kits
- packs

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `publicCode` | string unique | canonical identity |
| `organizationId` | UUID | manufacturer |
| `productModelId` | UUID | |
| `productClass` | enum | `main_product`, `spare_part`, `small_part`, `kit`, `pack` |
| `serialNumber` | string nullable | |
| `batchCode` | string nullable | |
| `lifecycleState` | enum | includes pre-install and active states |
| `warrantyState` | enum nullable | main products only |
| `customerId` | UUID nullable | created only at installation for installation-driven products |
| `installationDate` | datetime nullable | |
| `installationLocation` | `Json` nullable | |
| `rootMainAssetId` | UUID nullable | part-to-main lineage |
| `metadata` | `Json` | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

Suggested lifecycle states:

- `generated`
- `packed`
- `sold_pending_installation`
- `installation_scheduled`
- `installation_in_progress`
- `active`
- `consumed`
- `retired`
- `voided`

## 9.2 `AssetTag`

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `publicCode` | string unique | resolver code |
| `assetId` | UUID | |
| `tagClass` | enum | see tagging classes |
| `symbology` | enum | `qr`, `data_matrix`, `nfc_uri` |
| `status` | enum | `generated`, `printed`, `encoded`, `active`, `voided` |
| `materialVariant` | enum | `standard`, `high_temp`, `premium` |
| `printSizeMm` | int nullable | |
| `encodedValue` | string | short stable payload preferred |
| `viewerPolicy` | enum | `public`, `owner_only`, `technician_admin`, `warehouse_admin` |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## 9.3 `TagGenerationBatch`

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `organizationId` | UUID | |
| `productModelId` | UUID | |
| `quantity` | int | |
| `serialPrefix` | string nullable | |
| `serialStart` | string nullable | |
| `serialEnd` | string nullable | |
| `includeCartonRegistrationTags` | boolean | main products only |
| `defaultSymbology` | enum | |
| `outputProfile` | `Json` | print settings |
| `createdById` | UUID | |
| `createdAt` | datetime | |

## 9.4 `SaleRegistration`

Purpose:

- record pre-install commercial handoff against serialized sales lines
- do not create end-customer record yet for installation-driven products

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `assetId` | UUID | required |
| `organizationId` | UUID | manufacturer |
| `salesLineId` | string nullable | ERP sales-line reference |
| `channel` | enum | `carton_scan`, `manual_admin`, `erp_seeded`, `salesman_assisted` |
| `dealerId` | UUID nullable | |
| `distributorId` | UUID nullable | |
| `purchaseDate` | datetime nullable | |
| `registeredAt` | datetime | |
| `status` | enum | `registered`, `job_created`, `cancelled` |
| `metadata` | `Json` | source details |

## 9.5 `InstallationJob`

Purpose:

- schedule and execute installation work before activation

Required fields:

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
| `scheduledFor` | datetime nullable | |
| `technicianStartedAt` | datetime nullable | |
| `technicianCompletedAt` | datetime nullable | |
| `activationTriggeredAt` | datetime nullable | |
| `checklistTemplateSnapshot` | `Json` | |
| `commissioningTemplateSnapshot` | `Json` | |
| `metadata` | `Json` | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

Suggested statuses:

- `pending_assignment`
- `assigned`
- `scheduled`
- `technician_enroute`
- `on_site`
- `commissioning`
- `completed`
- `cancelled`
- `failed`

## 9.6 `InstallationReport`

This should be modeled explicitly rather than hidden inside the job completion payload.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `installationJobId` | UUID | one-to-one in phase 1 |
| `assetId` | UUID | main product |
| `submittedByUserId` | UUID | |
| `submittedByRole` | enum | `manufacturer_engineer`, `dealer_engineer`, `dealer_technician` |
| `customerName` | string | mandatory |
| `customerPhone` | string | mandatory |
| `customerEmail` | string nullable | |
| `installAddress` | string | mandatory |
| `installCity` | string | mandatory |
| `installState` | string | mandatory |
| `installPincode` | string | mandatory |
| `installationDate` | datetime | mandatory |
| `installerName` | string | mandatory |
| `unitSerialNumber` | string | mandatory |
| `geoLocation` | `Json` | mandatory |
| `customerAcknowledgementType` | enum | `otp`, `signature`, `digital_acceptance` |
| `customerAcknowledgementPayload` | `Json` | mandatory |
| `photoUrls` | `String[]` | mandatory |
| `checklistResponses` | `Json` | mandatory |
| `commissioningData` | `Json` | mandatory |
| `submittedAt` | datetime | |

Business rule:

- a valid installation report immediately activates warranty for installation-driven products

## 9.7 `JobPartUsage`

Use one usage model for installation and service.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `installationJobId` | UUID nullable | |
| `ticketId` | UUID nullable | |
| `mainAssetId` | UUID | required |
| `usedAssetId` | UUID nullable | tagged spare or kit |
| `usedTagId` | UUID nullable | exact scan surface |
| `usageType` | enum | `installed`, `consumed`, `returned_unused`, `removed` |
| `quantity` | decimal | |
| `linkedByUserId` | UUID | |
| `linkedAt` | datetime | |
| `metadata` | `Json` | |

Constraints:

- one of `installationJobId` or `ticketId` must be present
- installation-driven products require part usage capture where model policy demands it

## 9.8 `IntegrationConnector`

Use one connector definition model for every ERP family and file-based source.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `organizationId` | UUID | manufacturer tenant |
| `connectorType` | enum | `sap`, `oracle`, `dynamics`, `csv_sftp`, `custom_api` |
| `name` | string | user-facing connector name |
| `status` | enum | `draft`, `active`, `paused`, `error`, `archived` |
| `transportMode` | enum | `api_pull`, `file_push`, `scheduled_file_pull`, `manual_upload` |
| `authConfig` | `Json` | encrypted secrets and auth metadata |
| `endpointConfig` | `Json` | URLs, folders, object names, feed identifiers |
| `scheduleConfig` | `Json` | cron or cadence metadata |
| `lastSuccessfulRunAt` | datetime nullable | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## 9.9 `IntegrationMappingProfile`

Use mapping profiles to avoid hardcoding ERP field names into business logic.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `connectorId` | UUID | |
| `sourceEntity` | enum | `item_master`, `spare_master`, `dealer_master`, `technician_master`, `warehouse_master`, `sales_line` |
| `version` | int | increment on mapping changes |
| `fieldMappings` | `Json` | source-field to canonical-field map |
| `transformRules` | `Json` | trimming, normalization, date parsing, enum translation |
| `identityRules` | `Json` | source keys used for idempotency and upsert |
| `classificationRules` | `Json` | how to detect `main_product`, `spare_part`, `small_part`, `kit`, `pack` |
| `status` | enum | `draft`, `active`, `archived` |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## 9.10 `IntegrationRun`

Track each import or sync execution as a first-class runtime object.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `connectorId` | UUID | |
| `runType` | enum | `scheduled`, `manual`, `webhook`, `backfill` |
| `status` | enum | `queued`, `running`, `succeeded`, `partially_failed`, `failed`, `cancelled` |
| `startedAt` | datetime | |
| `completedAt` | datetime nullable | |
| `sourceWindowStart` | datetime nullable | incremental window start |
| `sourceWindowEnd` | datetime nullable | incremental window end |
| `totals` | `Json` | received, staged, accepted, rejected, quarantined counts |
| `errorSummary` | `Json` nullable | high-level run failure summary |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## 9.11 `IntegrationStagingRecord`

Every inbound record should land in staging first. Do not write ERP payloads directly into core domain tables.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `runId` | UUID | |
| `connectorId` | UUID | |
| `sourceEntity` | enum | same as mapping profile source entities |
| `sourceRecordKey` | string | natural key from source system |
| `sourceSequence` | string nullable | line/order sequencing where relevant |
| `rawPayload` | `Json` | unmodified inbound payload |
| `normalizedPayload` | `Json` nullable | canonical after mapping |
| `processingStatus` | enum | `received`, `mapped`, `validated`, `accepted`, `rejected`, `quarantined` |
| `errorCode` | string nullable | |
| `errorMessage` | string nullable | |
| `resolvedAt` | datetime nullable | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## 10. ERP Inbound Scope

ERP integration is not optional for installation-driven phase 1. It is inbound-first.

## 10.1 Required ERP Inbound Feeds

Import:

- product master
- spare master
- dealer / distributor master
- technician master
- warehouse / stock point master
- serialized sales lines for main products
- sales lines involving spares

## 10.2 Phase 1 Integration Direction

Phase 1:

- ERP -> platform inbound sync only
- inward inventory planning is in scope
- outward sync back to ERP can be deferred

Do not make the platform depend on outbound ERP integration before shipping the core workflow.

## 10.3 Canonical ERP Objects To Model

Recommended inbound entities:

- `ErpItemMasterSnapshot`
- `ErpSpareMasterSnapshot`
- `ErpDealerSnapshot`
- `ErpTechnicianSnapshot`
- `ErpWarehouseSnapshot`
- `ErpSalesLineSnapshot`

Minimal fields for serialized sales lines:

- ERP document number
- line number
- item code
- item description
- quantity
- serial number
- dealer/distributor code
- warehouse or dispatch location
- transaction date
- spare/main-product classification

## 10.4 Connector Architecture

ERP integration should be implemented as a generic connector framework with three layers:

1. source adapter layer
2. canonical mapping and validation layer
3. staging-to-domain application layer

The core platform must consume only canonical objects, never ERP-specific payload shapes.

### Layer 1: Source Adapter

Responsibilities:

- authenticate to source system
- fetch or receive source records
- checkpoint incremental progress
- write raw records into `IntegrationStagingRecord`

This layer does not perform domain writes.

### Layer 2: Mapping And Validation

Responsibilities:

- apply `IntegrationMappingProfile`
- normalize source values into canonical payloads
- validate required fields
- classify records into item or sales-line types
- reject or quarantine invalid data before domain upsert

### Layer 3: Domain Application

Responsibilities:

- upsert master snapshots
- create or update asset seeds for serialized main products and tagged spares
- create or update sale-registration seeds from serialized sales lines
- maintain idempotent references back to source records

## 10.5 Staging Table Strategy

Every connector run must use staging tables.

Required staging behavior:

- persist raw inbound payloads for audit
- persist mapped canonical payloads separately
- never mutate raw payload after ingest
- allow replay of `received`, `rejected`, or `quarantined` records after mapping fixes
- preserve source record keys for idempotency

Recommended supporting snapshot tables:

- `ErpItemMasterSnapshot`
- `ErpSpareMasterSnapshot`
- `ErpDealerSnapshot`
- `ErpTechnicianSnapshot`
- `ErpWarehouseSnapshot`
- `ErpSalesLineSnapshot`

These snapshot tables should represent the latest accepted view from ERP, while staging preserves the import evidence and failure handling workflow.

## 10.6 Mapping Rules

Mapping rules must be configurable per connector and per source entity.

Minimum mapping capabilities:

- source field to canonical field mapping
- string trimming and null normalization
- date and timestamp parsing
- code and enum translation
- dealer/distributor code remapping
- warehouse code remapping
- product class classification
- serialized vs batch vs quantity-only differentiation
- boolean coercion
- fallback defaults for optional fields only

### Mapping Rule Examples

- ERP item category codes can map to `main_product`, `spare_part`, `small_part`, `kit`, or `pack`
- ERP technician employee codes can map to internal technician user or placeholder import identities
- ERP sales-line serial lists can expand into one canonical serialized record per unit when needed
- spare sales lines without serials can map into pack-level or quantity-tracked records where the product model policy allows it

## 10.7 Idempotency And Upsert Rules

Every inbound entity type needs a stable identity rule.

Recommended identities:

- item master: source item code
- spare master: source spare code
- dealer master: source dealer code
- technician master: source employee or technician code
- warehouse master: source warehouse code
- sales line: source document number + line number + serial number when serialized

Rules:

- repeated imports of the same source key must update, not duplicate
- imported records must store source connector and source key lineage
- serial collisions across different source records must be quarantined unless explicitly resolved

## 10.8 Sync Modes

The framework should support all of these modes, even if phase 1 uses only a subset per connector:

- `manual_upload`
- `scheduled_file_pull`
- `file_push`
- `api_pull`
- `webhook_triggered`

### Phase 1 Recommended Modes

- SAP: `api_pull` or `scheduled_file_pull`
- Oracle: `api_pull` or `scheduled_file_pull`
- Dynamics: `api_pull`
- universal fallback: `csv_sftp` via `scheduled_file_pull` or `manual_upload`

## 10.9 Error Handling And Recovery

Error handling must be record-aware, not only run-aware.

### Run-Level Failures

Examples:

- authentication failure
- endpoint unavailable
- malformed file
- connector timeout

Required behavior:

- mark `IntegrationRun` as `failed`
- preserve no-domain-write guarantee for records not yet staged
- keep prior accepted domain state intact
- surface connector-level error summary in admin UI

### Record-Level Failures

Examples:

- missing required item code
- unknown dealer code
- invalid serial format
- duplicate serial collision
- unsupported product classification

Required behavior:

- mark staging record as `rejected` or `quarantined`
- continue processing unrelated valid records in the same run
- include actionable error codes and messages
- allow replay after mapping or source correction

### Quarantine Rules

Quarantine, do not silently drop, for:

- serial collisions
- ambiguous dealer or warehouse mapping
- unrecognized item class
- invalid model references needed for downstream activation flow

## 10.10 SAP / Oracle / Dynamics Adapter Strategy

The platform should provide connector families, not one-off customer integrations.

### SAP Adapter

Support these ingress patterns:

- OData or REST API pull
- scheduled flat-file or CSV export
- custom integration endpoint if customer middleware is already in place

Do not assume a single SAP implementation shape. SAP customers may expose:

- OData services
- custom APIs
- IDoc-derived exports
- middleware-generated files

So the SAP adapter should share the canonical mapping engine and vary only in transport and source schema mapping.

### Oracle Adapter

Support:

- REST API pull
- scheduled file export
- middleware push into the platform ingestion endpoint

Treat Oracle similarly to SAP: transport and field names vary, but canonical normalization remains shared.

### Dynamics Adapter

Support:

- OData or API pull
- incremental fetch windows
- scheduled sync jobs

Dynamics implementations are often more API-friendly, but still require configurable field mappings and code translation.

### Universal CSV/SFTP Adapter

This is the lowest-friction fallback and should ship early.

Support:

- CSV upload
- SFTP drop folder ingestion
- manual backfill upload

This connector is critical because it de-risks ERP integration even when direct API access is delayed.

## 10.11 Admin And Support Surfaces

Manufacturer admin should have connector management pages for:

- connector list and status
- mapping profile management
- sync run history
- failed and quarantined records
- replay or reprocess actions

Support operations should be able to answer:

- which source system sent this record
- when it arrived
- how it mapped
- why it failed
- whether it was applied to domain tables

## 10.12 Security And Secrets

Connector credentials must not be stored in plain text in business tables.

Requirements:

- encrypted secret storage
- least-privilege connector credentials
- audit trail for connector config changes
- redaction of secrets in logs and run error payloads
- tenant isolation on every connector and staging record

## 11. Workflow Design

## 11.1 Plug-And-Play Flow

1. product is generated and tagged
2. customer or assisted actor activates warranty
3. customer record is created during activation
4. service flow continues as current product behavior

## 11.2 Installation-Driven Flow

1. ERP imports product, spares, sales lines, and channel masters
2. manufacturer admin generates unit and carton tags
3. sales line or carton scan creates or confirms sale registration
4. asset moves to `sold_pending_installation`
5. installation job is created
6. authorized installer is assigned
7. installer submits digital installation report with all mandatory proof
8. warranty activates immediately on valid submission
9. end-customer record is created at installation report time
10. asset becomes `active`
11. future service tickets, spares, and customer flows work on the active asset

## 11.3 Installer Authority Rules

### Capital Goods

- installer must be manufacturer service engineer
- dealer cannot activate

### Dealer-Installed Products

- dealer engineer or dealer service technician can submit installation report

The product model policy determines which branch applies.

## 12. Service-Time And Install-Time Part Linkage

This is a core rule and must stay generic.

Do not permanently link a spare to a main product at dispatch.

Link a spare, kit, or part only when it is actually used against:

- a real `InstallationJob`, or
- a real `Ticket`

and tied to:

- the `main product` asset
- the `used spare/kit/small part` asset or tracked quantity
- the real work object
- the user who linked it
- the customer acknowledgement where applicable

This gives truthful field traceability instead of planned inventory intent.

## 13. Manufacturer Admin Generation Workflow

Manufacturer admin should have one generic generation surface:

- `Generate Item Labels`

Inputs:

- product model
- item class
- quantity or serial range
- symbology policy
- include carton tags
- print template
- export format

Outputs:

- `TagGenerationBatch`
- generated `AssetIdentity` rows
- generated `AssetTag` rows
- printable export artifacts

## 14. Scan Resolver Rules

All public and internal tag scans should resolve through one generic resolver.

Recommended route:

- `src/app/r/[code]/page.tsx`

Behavior:

- plug-and-play main product tags -> current activation or customer-service views
- installation-driven carton tags -> sale registration flow only
- installation-driven unit tags before install -> pending installation view or technician job view
- installation-driven unit tags after install -> customer product and service entry
- component, pack, and kit tags -> technician/admin part-resolution flow

## 15. UI Scope

## 15.1 Manufacturer Settings UI

Add or revise settings sections for:

- activation mode defaults
- installer authority defaults
- acknowledgement policy
- ERP inbound settings
- product-model override management

## 15.2 Product Model UI

Add fields for:

- `activationMode`
- `installationOwnershipMode`
- `activationTrigger`
- `partTraceabilityMode`
- `smallPartTrackingMode`
- installation checklist template
- commissioning template
- required proof settings

## 15.3 Installation Report UI

This must support:

- manufacturer engineer report submission
- dealer engineer or dealer technician report submission
- all mandatory proof fields
- customer acknowledgement capture
- mandatory part and kit scans where policy requires them

## 16. API Scope

## 16.1 Manufacturer Settings And Product Models

Update:

- manufacturer settings APIs
- product model create/update APIs

to support the generic configuration model.

## 16.2 ERP Inbound APIs Or Jobs

Add integration runtime support for:

- connector create, update, pause, resume
- mapping profile create, update, activate
- manual connector run trigger
- run history and run detail retrieval
- quarantined record list and replay
- item master imports
- spare master imports
- dealer and distributor imports
- technician imports
- warehouse imports
- serialized sales-line imports
- spare sales-line imports

Recommended endpoints or jobs:

- `POST /api/integrations/connectors`
- `GET /api/integrations/connectors`
- `GET /api/integrations/connectors/[id]`
- `PUT /api/integrations/connectors/[id]`
- `POST /api/integrations/connectors/[id]/run`
- `GET /api/integrations/runs`
- `GET /api/integrations/runs/[id]`
- `GET /api/integrations/runs/[id]/records`
- `POST /api/integrations/records/[id]/replay`
- scheduled integration workers per active connector

## 16.3 Asset And Tag Generation

Add:

- tag generation batch create/list/detail
- export endpoints for QR, Data Matrix, manifest, and NFC where applicable

## 16.4 Installation APIs

Add:

- create/list/get installation jobs
- assign/schedule/start/complete installation jobs
- submit installation report
- scan and record job part usage

Completion rules:

- installation-driven activation occurs only through valid installation report submission
- invalid or incomplete reports must not activate warranty

## 17. Validation Rules

### Product Model

- installation-driven models cannot allow self-activation
- installation-driven models must have a non-empty checklist template
- installation-driven models must define installer authority
- installation-driven models must define part traceability mode

### Installation Report

- all proof fields are mandatory for installation-driven models in phase 1
- customer acknowledgement is mandatory
- report submitter must be authorized for that product model
- main product serial must match the job asset
- required part scans must exist before activation

### ERP Imports

- duplicate sales-line imports must be idempotent
- serial number collisions must be rejected or quarantined
- imported spare lines must preserve main/spare classification
- connector runs must preserve raw payload auditability
- invalid records must fail independently without discarding valid records in the same run
- replay must be possible after mapping or source correction

### Part Usage

- individually tracked spare cannot be installed on two active main assets
- pack-level or kit-level usage must include quantity and reference asset
- required install kit scans block installation completion

## 18. Build Strategy

## Phase A: Generic Settings And Policy Layer

- manufacturer defaults
- product-model overrides
- validation rules

## Phase B: Generic Asset And Tag Model

- asset identity
- tag identity
- tag generation batches
- QR and Data Matrix exports

## Phase C: ERP Inbound Foundations

- item master imports
- spare master imports
- channel master imports
- technician imports
- serialized sales-line imports
- connector runtime, mapping profiles, and staging/replay support

## Phase D: Installation Workflow

- sale registration
- installation jobs
- installation report submission
- activation on report submission

## Phase E: Part Traceability

- install-time part usage
- service-time part usage
- pack and kit handling

## Phase F: Resolver And Public Flow Cutover

- generic resolver
- plug-and-play path
- installation-driven path

## 19. Acceptance Criteria

The generic platform is ready when:

1. Manufacturer can configure product models as `plug_and_play` or `installation_driven`.
2. Manufacturer can configure installer authority as `manufacturer_only` or `dealer_allowed`.
3. Plug-and-play models retain current activation behavior.
4. Installation-driven models activate only through valid installation report submission.
5. Capital goods can be restricted to manufacturer engineer installation only.
6. Dealer-installed models can be activated by dealer installation report submission.
7. ERP inbound feeds can seed product, spare, technician, dealer, warehouse, and serialized sales-line data.
8. End-customer records for installation-driven products are created only during installation report submission.
9. Mandatory spare and kit linkage blocks completion where required.
10. Main product, spare, small part, kit, and pack tagging are all supported by one generic identity model.

## 20. Summary

The right build is not a single-prospect workflow.

The right build is:

- one generic activation framework
- one generic installation workflow
- one generic asset and tag model
- one generic part-usage model
- one inbound-first ERP foundation
- configurable manufacturer and product-model policy controls

That gives the platform enough structure to support:

- today’s plug-and-play products
- installation-driven medical and heavy-equipment manufacturers
- future variations without repeated workflow rewrites
