# Phase 1 SAP Connector Scope Plan

Date: 2026-06-03

## Scope

This plan defines the Phase 1 SAP inbound connector scope required to support the BPL installation-driven warranty lifecycle.

Phase 1 connector scope includes only these inbound feeds:
- item master
- distributor master
- serialized dispatch or invoice feed

The goal is to make the platform ready for:
- pre-dispatch serialized machine and QR generation
- serialized dispatch recognition from SAP
- installation-driven warranty activation
- post-sales service traceability against the correct dispatched machine

This plan is intentionally inbound-only. Outbound SAP sync is out of scope for this phase.

## State of Current System

The current application already has a usable domain foundation for serialized assets and installation-driven workflows.

What already exists:
- `Organization` with support for multiple organization types including `distributor` in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:251)
- `ProductModel` as the manufacturer-owned product definition in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:350)
- `AssetIdentity` for serialized assets in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:420)
- `AssetTag` for QR / Data Matrix / NFC identities in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:460)
- `SerializedSalesLine` for one serialized external sales-line record per asset in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:485)
- `SaleRegistration` for installation-driven sale registration and job creation in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:516)
- `InstallationJob` and `InstallationReport` for the downstream installation lifecycle in [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:540)
- manufacturer tag generation already creates serialized `AssetIdentity` and `AssetTag` rows in [src/app/api/manufacturer/tag-generation/batches/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/tag-generation/batches/route.ts:295)
- sale registration can already upsert `SerializedSalesLine` records directly in [src/app/api/manufacturer/sale-registrations/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/sale-registrations/route.ts:264)

Current architectural limitations:
- there is no connector runtime
- there is no staging layer for inbound ERP data
- there is no import run history or replay mechanism
- there is no stable ERP master-reference layer for item and distributor mapping
- distributor handling is too lightweight for ERP-grade synchronization
- current serialized sales-line handling is application-driven, not connector-driven

Implication:

The current schema can support the downstream workflow, but it is missing the integration layer and master-reference layer needed to load SAP data safely and repeatedly without architecture churn.

## State of Ideal System

The ideal Phase 1 system should work like this:

1. SAP sends item master into the platform.
2. SAP sends distributor master into the platform.
3. The platform maps incoming SAP item codes to internal manufacturer product models.
4. The platform maps incoming SAP distributor codes to distributor organizations.
5. The platform supports factory-side creation of serialized machine identities and QR codes for valid item series.
6. SAP sends serialized dispatch or invoice lines.
7. The connector reconciles each serialized dispatch row against a known serialized asset.
8. Valid rows create or update `SerializedSalesLine` and drive the machine into dispatched or pending-installation state.
9. Invalid or unmatched rows go to exception state and can be replayed after correction.

Architecturally, the ideal Phase 1 design should separate:
- raw ERP ingestion
- validation and staging
- canonical ERP master records
- business-domain synchronization into product, organization, asset, and sales-line tables

That separation is important. It prevents the connector from writing directly into business tables without auditability and reduces later migration pain when additional SAP feeds arrive.

## Design Principles

### 1. Keep the current asset and installation domain

Do not replace the existing `AssetIdentity`, `AssetTag`, `SerializedSalesLine`, `SaleRegistration`, or installation workflow models. They are already aligned with the BPL business flow.

### 2. Add an integration runtime instead of embedding ERP logic in business APIs

The manufacturer sale-registration route should not remain the long-term integration path for SAP-origin data. SAP imports should run through dedicated connector tables and services first.

### 3. Introduce ERP reference identity everywhere it matters

Every imported master and transaction feed should preserve:
- source system
- external record key
- feed type
- import run id
- payload snapshot

This is required for replay, auditability, and later feed expansion.

### 4. Reconcile serialized dispatch only against known or explicitly creatable assets

The serialized dispatch feed must not create uncontrolled duplicate machine identities. Unknown serials should be staged as exceptions unless the approved business rule explicitly allows connector-side asset creation.

### 5. Use hard cutover to connector-driven ingestion

For SAP-origin data, the long-term path should be connector-owned ingestion. Avoid parallel permanent manual and connector ingestion logic for the same data domain.

## Recommended Schema Additions

The following additions are recommended before connector implementation starts.

### A. Integration runtime tables

Add a small generic runtime instead of creating one-off feed tables only.

Recommended models:
- `IntegrationConnector`
- `IntegrationFeed`
- `IntegrationRun`
- `IntegrationStagingRecord`
- `IntegrationReplayRequest`

Recommended purpose:
- `IntegrationConnector`: logical SAP connector definition per manufacturer org
- `IntegrationFeed`: item master, distributor master, serialized dispatch feed definitions
- `IntegrationRun`: one execution instance of a feed import
- `IntegrationStagingRecord`: raw inbound rows with validation status, normalized key, and error details
- `IntegrationReplayRequest`: targeted replay of failed rows or runs

Minimum fields:
- `organizationId`
- `connectorType`
- `feedType`
- `sourceSystem`
- `status`
- `externalRecordKey`
- `payload`
- `normalizedPayload`
- `errorCode`
- `errorMessage`
- `processedAt`
- `runStartedAt`
- `runCompletedAt`

### B. ERP reference fields on existing business entities

Current business tables need stable external identifiers.

Recommended additions:
- `Organization.externalCode`
- `Organization.parentOrganizationId` for manufacturer-to-distributor or distributor-to-service hierarchy where needed
- `ProductModel.externalItemCode`
- `ProductModel.externalItemSeriesCode` or equivalent series key if SAP provides series grouping
- `AssetIdentity.externalSerialSource` if source-specific serial traceability is needed

Reasoning:
- distributor master cannot rely on name matching
- item master cannot rely on free-text model names
- later feeds must join using external identifiers, not UI labels

### C. Canonical ERP master shadow tables

Do not overload `ProductModel` and `Organization` with raw SAP payload history.

Recommended models:
- `ErpItemMasterRecord`
- `ErpDistributorMasterRecord`
- `ErpSerializedDispatchRecord`

Recommended purpose:
- retain the latest normalized SAP view
- preserve source payload and mapped internal target
- allow reprocessing without losing source lineage

Recommended links:
- `ErpItemMasterRecord.productModelId`
- `ErpDistributorMasterRecord.organizationId`
- `ErpSerializedDispatchRecord.assetId`
- `ErpSerializedDispatchRecord.serializedSalesLineId`

### D. Dispatch reconciliation status

The dispatch feed needs explicit reconciliation tracking.

Recommended enum or status field values:
- `pending_match`
- `matched`
- `created_domain_record`
- `conflict`
- `rejected`
- `replayed`

Use this on:
- `IntegrationStagingRecord`
- `ErpSerializedDispatchRecord`

### E. Optional but strongly recommended factory serialization work-queue

If factory serialization will be operationalized in-app, add a queue or planning table rather than relying only on ad hoc tag-generation batches.

Recommended model:
- `SerializationPlan`

Purpose:
- request generation for a given item code / model / quantity / serial range
- track planned vs generated vs printed vs affixed state

This is not strictly required for the first connector milestone, but it is the cleanest bridge from item master to factory QR generation.

## Mapping Strategy

### Item master

Source:
- SAP item master

Should map into:
- `ErpItemMasterRecord`
- `ProductModel` where approved

Key mapping decisions:
- one SAP item code should map to one internal `ProductModel`
- connector should support update, not just create
- policy fields such as activation mode should remain manufacturer-managed unless explicitly sourced from ERP

### Distributor master

Source:
- SAP distributor master

Should map into:
- `ErpDistributorMasterRecord`
- `Organization` rows with type `distributor`

Key mapping decisions:
- external distributor code must be unique per manufacturer org
- name, address, contact details are syncable fields
- operational authorization fields should remain platform-managed if ERP is not source of truth

### Serialized dispatch or invoice feed

Source:
- SAP serialized dispatch line or invoice line

Should map into:
- `ErpSerializedDispatchRecord`
- `SerializedSalesLine`
- optionally `SaleRegistration` if the agreed rule is to ERP-seed sale registration automatically

Key mapping decisions:
- one serialized dispatch row should reconcile to one `AssetIdentity`
- matching priority should be `serialNumber`, then explicit `asset public code` if provided
- unmatched serials must be staged as exceptions
- duplicate SAP rows must be idempotent by `sourceRecordKey`

## Plan Phases

### Phase 1. Connector runtime foundation

#### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:251)
- [src/app/api/manufacturer/sale-registrations/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/sale-registrations/route.ts:177)
- [src/app/api/manufacturer/tag-generation/batches/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/tag-generation/batches/route.ts:134)

#### What to do
- add generic integration runtime models
- add ERP external-reference fields to `Organization` and `ProductModel`
- add canonical ERP shadow tables for item master, distributor master, and serialized dispatch
- define connector enums for feed type, run status, row status, and source system
- create migration with indexes on `organizationId`, `externalRecordKey`, `sourceRecordKey`, and reconciliation status

#### Validation strategy
- verify one import run can store raw payload, normalized payload, and status safely
- verify duplicate feed rows do not create duplicate staging or canonical records
- verify schema supports replay without mutating business-domain tables directly

#### Risks / fallbacks
- risk: putting all ERP data directly into `ProductModel` and `Organization` creates brittle coupling
- fallback: always retain shadow tables even if the business tables are updated in the same run

### Phase 2. Item master inbound

#### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:350)
- [src/app/api/manufacturer/product-model/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/product-model/route.ts:156)

#### What to do
- implement item master ingestion into `IntegrationStagingRecord`
- normalize item rows into `ErpItemMasterRecord`
- add mapping from external item code to internal `ProductModel`
- support create and update flows for allowed `ProductModel` fields
- keep product-policy fields platform-owned unless SAP is formally approved as source of truth for them
- expose import-run and exception visibility for item master rows

#### Validation strategy
- import a clean item file twice and confirm idempotent result
- import changed description fields and confirm update propagation
- verify external item code uniqueness at manufacturer scope
- verify bad item rows stay quarantined and do not mutate `ProductModel`

#### Risks / fallbacks
- risk: treating item descriptions as stable identity instead of item code
- fallback: require external item code as the primary mapping key and reject rows without it

### Phase 3. Distributor master inbound

#### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:251)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:701)

#### What to do
- implement distributor-master ingestion into staging and canonical ERP tables
- map each SAP distributor code to an `Organization` of type `distributor`
- add parent linkage or manufacturer ownership linkage where required
- store ERP code and maintain syncable address/contact fields
- support inactive state handling rather than hard deletion

#### Validation strategy
- verify the same distributor code always resolves to the same organization
- verify updates change contact/address fields without breaking existing business relations
- verify inactive distributor rows remain auditable

#### Risks / fallbacks
- risk: multiple distributor organizations created from slight name variation
- fallback: enforce code-based matching and prevent name-based auto-creation when code is missing

### Phase 4. Serialized dispatch inbound and reconciliation

#### Files to read before starting
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:420)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:485)
- [src/app/api/manufacturer/sale-registrations/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/sale-registrations/route.ts:235)
- [src/lib/installation-workflow.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/installation-workflow.ts:1)

#### What to do
- implement serialized dispatch ingestion into staging and canonical dispatch tables
- compute stable `sourceRecordKey` using SAP document number, line number, and serial number
- reconcile each row to a known `AssetIdentity`
- create or update `SerializedSalesLine`
- move matched assets into `sold_pending_installation` or the current approved lifecycle state
- optionally create `SaleRegistration` with `erp_seeded` channel if that is the approved business rule
- keep unmatched or conflicting rows in exception state with replay support

#### Validation strategy
- verify repeated dispatch imports remain idempotent
- verify known serials are matched correctly
- verify unknown serials are quarantined instead of silently creating incorrect assets
- verify lifecycle-state update happens only after successful reconciliation

#### Risks / fallbacks
- risk: dispatch feed arrives before factory serialization exists for that serial
- fallback: preserve row in `pending_match` state and allow replay after asset generation completes

### Phase 5. Factory serialization readiness integration

#### Files to read before starting
- [src/app/api/manufacturer/tag-generation/batches/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/tag-generation/batches/route.ts:201)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:394)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:420)

#### What to do
- define the handoff from item master to factory QR generation
- ensure item-code to product-model mapping is stable before any batch generation
- add optional serialization planning table if factory operations need batch planning and auditability
- enforce serial-range conflict prevention against existing assets
- ensure export files for QR/Data Matrix remain tied to the generated assets and item series

#### Validation strategy
- verify generated assets can be traced back to the item master mapping
- verify generated serial ranges cannot overlap existing assets
- verify dispatch feed can later match those same serialized assets cleanly

#### Risks / fallbacks
- risk: ad hoc manual generation produces serial drift from SAP expectations
- fallback: require approved serial-range input or ERP-backed serial plan before production generation

### Phase 6. Connector operations and admin surface

#### Files to read before starting
- [src/app/api/manufacturer/settings/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/settings/route.ts:177)

#### What to do
- add connector configuration for SAP source details
- add run history and failure summaries
- add row-level exception views for item, distributor, and dispatch feeds
- add replay controls for failed runs and failed rows
- add import metrics and alerting hooks

#### Validation strategy
- verify operators can identify which rows failed and why
- verify replay only reprocesses selected rows or runs
- verify run history remains auditable after multiple replays

#### Risks / fallbacks
- risk: lack of observability pushes debugging into direct database access
- fallback: make exception and run-log visibility mandatory before production rollout

## Recommended Business Decisions Before Build Starts

These decisions should be locked before implementation begins:

1. Should serialized dispatch import auto-create `SaleRegistration`, or only create `SerializedSalesLine` and wait for explicit operational registration?
2. Should unknown serials in dispatch feed be rejected outright or held in `pending_match` until factory serialization catches up?
3. Is SAP the source of truth only for item and distributor master, or also for specific product classification fields?
4. Will serial numbers be generated in SAP, in the platform, or in a coordinated hybrid process?
5. Is one manufacturer organization mapped to one SAP company code, or can multiple SAP source codes feed one manufacturer tenant?

## Cross-system Requirements

### SAP-side requirements

Phase 1 depends on SAP making these three feeds available consistently:
- item master
- distributor master
- serialized dispatch or invoice lines

Each feed should provide:
- stable external key
- change timestamp
- active or inactive indicator where applicable
- manufacturer-scoped business context

### Platform-side requirements

The platform must provide:
- idempotent import behavior
- connector auditability
- row-level exception handling
- replay support
- strong mapping by external keys rather than name matching

## Recommendation

The correct first build is not a broad ERP program. It is a narrow but properly structured inbound SAP connector foundation.

Recommended implementation order:
1. integration runtime and schema foundation
2. item master inbound
3. distributor master inbound
4. serialized dispatch inbound and reconciliation
5. factory serialization readiness alignment
6. connector operations surface

This order fits the current schema, preserves the existing asset and installation domain, and avoids later architecture issues by introducing ERP lineage, staging, replay, and reconciliation from the beginning.
