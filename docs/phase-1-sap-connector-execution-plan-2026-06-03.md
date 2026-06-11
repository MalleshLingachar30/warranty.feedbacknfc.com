# Phase 1 SAP Connector Execution Plan

Date: 2026-06-03

Reference:
- [Phase 1 SAP Connector Scope Plan](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/docs/phase-1-sap-connector-scope-plan-2026-06-03.md:1)

## Purpose

This document breaks the approved Phase 1 SAP connector scope into a systematic execution sequence from Step 1 through Step 5.

This plan is intended to help the team build the connector foundation in the correct order so that:
- the current schema is extended cleanly
- later feeds do not create architecture problems
- factory QR generation, serialized dispatch recognition, and installation-driven warranty can all work on the same data base

## State of Current System

The current application already has strong business-domain models for serialized assets and installation workflows:
- `Organization`
- `ProductModel`
- `AssetIdentity`
- `AssetTag`
- `SerializedSalesLine`
- `SaleRegistration`
- `InstallationJob`
- `InstallationReport`

The current system can already:
- create serialized asset identities and QR/Data Matrix/NFC tags through manufacturer tag-generation batches
- store one serialized dispatch-like record per asset through `SerializedSalesLine`
- start installation-driven lifecycle after registration and installation reporting

The current system cannot yet:
- ingest SAP data through a connector runtime
- stage and validate incoming ERP rows
- preserve ERP lineage cleanly across imports
- replay failed rows or failed import runs
- synchronize item master and distributor master systematically

That means the business-domain base is usable, but the integration layer is missing.

## State of Ideal System

The ideal Phase 1 flow should work in this order:

1. SAP item master is imported.
2. SAP distributor master is imported.
3. The platform has valid internal mappings for items and distributors.
4. Factory-side serialized machine identities and QR codes are generated against valid mapped item series.
5. SAP serialized dispatch feed arrives.
6. Each dispatch row is reconciled against a known serialized asset.
7. The machine becomes dispatch-recognized and pending-installation.
8. Installation-driven warranty and service traceability continue from there.

## Execution Sequence

The recommended implementation order is:
- Step 1. Connector runtime foundation
- Step 2. Item master inbound
- Step 3. Distributor master inbound
- Step 4. Serialized dispatch inbound and reconciliation
- Step 5. Factory serialization readiness alignment

This is the correct order because each later step depends on stable mapping and traceability created by the earlier steps.

## Plan Phases

## Step 1. Connector runtime foundation

### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:251)
- [src/app/api/manufacturer/sale-registrations/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/sale-registrations/route.ts:177)
- [src/app/api/manufacturer/tag-generation/batches/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/tag-generation/batches/route.ts:134)

### What to do

Build the generic inbound connector runtime first. Do not start with feed-specific APIs only.

Create these new schema concepts:
- `IntegrationConnector`
- `IntegrationFeed`
- `IntegrationRun`
- `IntegrationStagingRecord`
- `IntegrationReplayRequest`

Add the minimum fields required for safe imports:
- organization scope
- source system
- feed type
- external record key
- raw payload
- normalized payload
- processing status
- processing timestamps
- error code and error message
- run linkage

Add required enums:
- connector type
- feed type
- run status
- row status
- replay status

Add ERP reference fields on core business entities:
- `Organization.externalCode`
- `ProductModel.externalItemCode`
- optional item-series external field if SAP provides series-level grouping

Create a service-layer structure for connector processing:
- ingestion service
- normalization service
- validation service
- apply-to-domain service
- replay service

Do not wire this into live business APIs yet. The objective of Step 1 is to create the integration substrate.

### Deliverables
- Prisma schema update for connector runtime
- first migration for connector tables and indices
- shared TypeScript types for feed and run statuses
- service skeletons for ingest, validate, apply, replay
- basic manufacturer-facing connector config placeholder

### Validation strategy
- create a sample import run and verify it stores rows in staging
- verify duplicate raw rows do not create duplicate staging identity where idempotency key exists
- verify failed rows can remain in staging without mutating business-domain tables
- verify each row preserves raw payload and normalized payload

### Risks / fallbacks
- risk: directly mutating domain tables during ingestion without staging
- fallback: enforce staging-first processing in the runtime contract

- risk: over-generalizing the connector before the first three SAP feeds are implemented
- fallback: keep the runtime generic only to the extent required by item, distributor, and dispatch feeds

## Step 2. Item master inbound

### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:350)
- [src/app/api/manufacturer/product-model/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/product-model/route.ts:156)

### What to do

Implement the first actual SAP feed using the runtime created in Step 1.

Add canonical ERP master table:
- `ErpItemMasterRecord`

Recommended fields:
- organizationId
- externalItemCode
- externalSeriesCode if available
- itemDescription
- category
- subCategory
- active flag
- raw payload
- normalized payload
- mapped `productModelId`
- last imported at

Define what item master is allowed to update in `ProductModel`.

Recommended ERP-owned fields:
- item code
- name or description
- category
- subcategory
- model number where sourced from ERP

Recommended platform-owned fields:
- activation mode
- installation ownership mode
- installation required
- customer acknowledgement required
- part traceability mode
- small-part tracking mode
- installation templates

Build processing flow:
1. ingest raw item-master rows
2. normalize into canonical fields
3. validate mandatory keys
4. upsert `ErpItemMasterRecord`
5. create or update `ProductModel` where allowed
6. record per-row outcome in staging

### Deliverables
- schema update for `ErpItemMasterRecord`
- item-master normalization logic
- item-master application logic to `ProductModel`
- import-run reporting for item feed
- exception handling for invalid rows

### Validation strategy
- import the same item file twice and verify idempotent behavior
- import an updated description and verify allowed fields update correctly
- verify missing external item code causes row rejection
- verify no accidental overwrite of platform-owned policy fields

### Risks / fallbacks
- risk: item-master import becomes the source of truth for operational policy fields
- fallback: keep policy fields explicitly excluded from SAP sync unless separately approved

- risk: item-code uniqueness is not enforced per manufacturer org
- fallback: add unique constraints and reject ambiguous mappings

## Step 3. Distributor master inbound

### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:251)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:701)

### What to do

Implement distributor master as the second feed on top of the same runtime.

Add canonical ERP master table:
- `ErpDistributorMasterRecord`

Recommended fields:
- organizationId
- externalDistributorCode
- distributorName
- address fields
- contact fields
- active flag
- parent manufacturer linkage
- mapped `Organization.id`
- raw payload
- normalized payload

Extend `Organization` cleanly for ERP synchronization:
- add `externalCode`
- optionally add `parentOrganizationId`
- keep `type = distributor`

Build processing flow:
1. ingest raw distributor rows
2. normalize distributor code and business attributes
3. validate external code
4. upsert `ErpDistributorMasterRecord`
5. create or update distributor `Organization`
6. mark inactive distributors without hard deletion

The system should match distributors by ERP code, not by name.

### Deliverables
- schema update for `ErpDistributorMasterRecord`
- schema extension for ERP-linked `Organization`
- distributor normalization and application logic
- import-run reporting for distributor feed
- row-level exception handling for missing or conflicting distributor codes

### Validation strategy
- import the same distributor feed twice and confirm no duplicate organizations
- change a distributor address and verify safe update
- deactivate a distributor and verify no destructive removal
- verify name variations do not create duplicate distributor rows

### Risks / fallbacks
- risk: current `Organization` model is used too loosely and causes duplicate distributor entities
- fallback: enforce external-code-based matching and quarantine code-less rows

- risk: distributor import starts carrying service-center logic prematurely
- fallback: keep Phase 1 distributor feed limited to distributor master only

## Step 4. Serialized dispatch inbound and reconciliation

### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:420)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:485)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:516)
- [src/app/api/manufacturer/sale-registrations/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/sale-registrations/route.ts:235)

### What to do

Implement the serialized dispatch or invoice feed as the first transactional connector feed.

Add canonical ERP table:
- `ErpSerializedDispatchRecord`

Recommended fields:
- organizationId
- externalDocumentNumber
- externalLineNumber
- externalRecordKey
- itemCode
- serialNumber
- distributorCode
- warehouseCode
- dispatch or invoice date
- status
- mapped `assetId`
- mapped `serializedSalesLineId`
- raw payload
- normalized payload

Processing flow:
1. ingest raw dispatch rows
2. normalize fields and compute `externalRecordKey`
3. validate mandatory fields:
   - item code
   - serial number
   - document number
4. reconcile against internal mappings:
   - item code to `ProductModel`
   - distributor code to distributor `Organization`
   - serial number to `AssetIdentity`
5. create or update `ErpSerializedDispatchRecord`
6. if matched, create or update `SerializedSalesLine`
7. move matched asset into `sold_pending_installation`
8. optionally create `SaleRegistration` if business approves ERP-seeded registration
9. if unmatched, keep row in exception or `pending_match`

Important rule:

Do not let serialized dispatch import create uncontrolled asset identities by default.

If a dispatch row arrives for a serial that does not exist in `AssetIdentity`, it should go to exception state or `pending_match` until factory-side serialization catches up.

### Deliverables
- schema update for `ErpSerializedDispatchRecord`
- dispatch normalization logic
- reconciliation service
- application logic for `SerializedSalesLine`
- optional ERP-seeded `SaleRegistration` logic if approved
- exception reporting for unmatched serials and bad mappings

### Validation strategy
- import the same dispatch feed twice and confirm idempotent update behavior
- verify matched serials update `SerializedSalesLine` correctly
- verify unmatched serials do not create duplicate or incorrect assets
- verify asset lifecycle state only changes after successful reconciliation
- verify distributor mapping is code-based and not name-based

### Risks / fallbacks
- risk: dispatch feed arrives before serialized asset generation is complete
- fallback: mark row `pending_match` and support replay after asset creation

- risk: ERP-seeded sale registration creates downstream installation noise too early
- fallback: keep ERP-seeded registration behind an explicit business rule and start with `SerializedSalesLine` only if needed

## Step 5. Factory serialization readiness alignment

### Files to read before starting
- [src/app/api/manufacturer/tag-generation/batches/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/tag-generation/batches/route.ts:201)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:394)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:420)

### What to do

Align the existing asset and tag-generation workflow with the new SAP master-mapping layer.

This step is not about inventing a new QR system. It is about making sure factory-side QR generation now depends on stable SAP item-master mapping.

Build these controls:
- tag-generation batch must target a valid `ProductModel` already mapped from SAP item master
- serial-range generation must be validated against existing generated assets
- QR generation exports must remain tied to the internal asset identities
- factory operations must be able to distinguish:
  - planned serial range
  - generated serial range
  - printed labels
  - affixed labels if later tracked

Strongly recommended addition:
- `SerializationPlan`

Recommended fields:
- organizationId
- productModelId
- externalItemCode
- requestedQuantity
- requestedSerialPrefix
- requestedSerialStart
- requestedSerialEnd
- status
- linked tag-generation batch ids
- created by
- approved by if required

Processing flow:
1. item master mapping exists
2. factory requests serialization for an item series
3. system validates item mapping and serial range
4. system creates or confirms generation batch
5. labels are exported and affixed before dispatch
6. later dispatch import matches against these pre-created assets

### Deliverables
- integration guardrails around existing tag generation
- optional `SerializationPlan` schema and service
- validation that batch generation is item-master-consistent
- operational note for factory process

### Validation strategy
- verify batch generation cannot use unmapped or invalid item references
- verify generated serials are unique and dispatch-reconcilable
- verify one generated serial can later be matched by dispatch feed without ambiguity
- verify product-model to item-code mapping remains stable after repeated imports

### Risks / fallbacks
- risk: factory continues ad hoc QR generation without item-master mapping discipline
- fallback: require approved item mapping before allowing production batch generation for Phase 1 flow

- risk: serial range generated in platform diverges from serial expectations in SAP
- fallback: agree one source of truth for serial planning before go-live

## Cross-provider requirements

### SAP-side requirements

For Step 1 through Step 5 to succeed, SAP must provide:
- item master feed
- distributor master feed
- serialized dispatch or invoice feed

Each feed should include:
- stable external key
- change or extract timestamp
- active or inactive indicator
- manufacturer business scope

### Platform-side requirements

The platform must provide:
- staging-first ingestion
- idempotent processing
- code-based mapping
- replay and reprocessing
- exception reporting
- strong reconciliation controls

## Recommended decisions to lock before implementation

These decisions should be closed before build starts:

1. Will `SaleRegistration` be created automatically from dispatch feed, or only `SerializedSalesLine`?
2. Will unknown serial dispatch rows be rejected or held in `pending_match`?
3. Who owns serial planning: SAP, platform, or a coordinated factory process?
4. Which `ProductModel` fields are ERP-owned vs platform-owned?
5. Should `SerializationPlan` be included in the first implementation or handled operationally for the initial release?

## Recommended team build order

The engineering execution order should be:

1. Prisma schema and migration for connector runtime
2. item master ingest and mapping
3. distributor master ingest and mapping
4. serialized dispatch ingest and reconciliation
5. factory serialization alignment and controls

No downstream technician master or service-agency master work should be started before these five steps are stable, because the installation-driven lifecycle depends first on machine identity, dispatch truth, and distributor context.

## Recommendation

Build Step 1 through Step 5 as one coherent Phase 1A foundation program.

That program will give the platform:
- ERP-backed item truth
- ERP-backed distributor truth
- dispatch truth for serialized machines
- clean reconciliation to internal serialized assets
- factory-ready QR generation discipline

Once these five steps are complete, the next phase can safely move into technician master, installation assignment, warranty activation, and post-sales service traceability without architecture problems.
