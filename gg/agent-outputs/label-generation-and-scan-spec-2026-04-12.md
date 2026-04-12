# Label Generation And Scan Specification

Date: 2026-04-12
Repo: `warranty.feedbacknfc.com`
Author: `prime_guide`

## Goal

Define an implementation-ready label and scan architecture for manufacturer-admin managed identity generation across:

- main products
- spare parts
- small parts
- kits
- packs

The design must fit this codebase, replace the current sticker-only mental model, and support hard cutover to a canonical identity model where QR, Data Matrix, and NFC are rendering or transport choices rather than the identity itself.

## Current-State Anchors In This Codebase

The current platform already has the right operational flow, but it is modeled around a single `Sticker` per `Product`:

- `prisma/schema.prisma`
  - `ProductModel`
  - `Sticker`
  - `Product`
  - `StickerAllocation`
  - `StickerScanEvent`
  - `ScanLog`
  - `Ticket`
  - `WarrantyClaim`
- public scan entrypoints
  - `src/app/q/[id]/page.tsx`
  - `src/app/c/[id]/page.tsx`
  - `src/app/nfc/[id]/page.tsx`
- manufacturer generation and export
  - `src/app/api/manufacturer/allocate/route.ts`
  - `src/app/api/manufacturer/stickers/generate-qr/route.ts`
  - `src/app/api/manufacturer/stickers/generate-nfc-encoding/route.ts`
  - `src/components/manufacturer/sticker-wizard-client.tsx`
- settings and sticker mode
  - `src/lib/sticker-config.ts`
  - `src/app/api/manufacturer/settings/route.ts`
  - `src/components/manufacturer/settings-client.tsx`
- activation, ticketing, and service proof
  - `src/app/api/warranty/activate/route.ts`
  - `src/app/api/ticket/create/route.ts`
  - `src/app/api/ticket/[id]/complete/route.ts`
  - `src/app/api/ticket/[id]/confirm/route.ts`

Important current behavior to preserve:

- carton QR can trigger point-of-sale activation
- product scan resolves into role-aware experiences
- technician completion and customer confirmation create claim-ready evidence
- manufacturer-admin already manages ranges, exports, and sticker mode

Important current limitations to remove:

- `Sticker` assumes one physical tag concept
- `Product` assumes only finished goods
- `StickerAllocation` assumes one-to-one finished product serial binding
- `partsUsed` is freeform JSON rather than linkable tagged spare usage
- scan resolution is tag-number-first rather than identity-first

## Design Principles

1. Canonical identity is not a QR code, Data Matrix, NFC URI, or URL path.
2. One real-world asset may have multiple tags.
3. Customer-facing tags and service-only tags are different tagging classes.
4. A pack or kit may have its own parent identity even when child items also have identities.
5. Spare linkage during service must become structured data, not only freeform `partsUsed`.
6. Hard cutover is preferred over backward-compatible branching. This spec assumes a clean domain migration, not a permanent hybrid model.

## 1. Product Classes And Tagging Classes

### Product Classes

Use `productClass` on the catalog master. The existing `ProductModel` should be generalized instead of creating parallel catalog concepts.

| Product Class | Meaning | Individually Serviceable | Individually Warrantable | Typical Example |
| --- | --- | --- | --- | --- |
| `main_product` | Finished unit sold to customer | Yes | Yes | AC, purifier, geyser |
| `spare_part` | Replaceable service component | Yes | Usually no | PCB, membrane, compressor relay |
| `small_part` | Very small or low-cost component | Sometimes | No | O-ring, clip, screw set, gasket |
| `kit` | Predefined set of parts consumed or installed together | Parent yes, child optional | Usually no | installation kit, filter replacement kit |
| `pack` | Logistics or retail grouping of one or more units | Parent no, child depends | No | carton of 10 filters, retail multipack |

### Tagging Classes

Use `tagClass` on the physical or digital tag record.

| Tag Class | Bound To | Viewer Scope | Primary Use |
| --- | --- | --- | --- |
| `unit_service` | `main_product` or individually tracked `spare_part` | customer, technician, admin | product-level service and identity access |
| `carton_activation` | `main_product` | salesman assisted, customer, admin | point-of-sale activation or sale registration |
| `component_unit` | `spare_part` or child item in `kit` | technician, admin | service-time component verification |
| `small_part_batch` | `small_part` batch or pouch | technician, admin | batch-level consumption and traceability |
| `kit_parent` | `kit` | technician, admin | link and consume a predefined set of components together |
| `pack_parent` | `pack` | warehouse, technician, admin | grouped handling, dispatch, receiving, unpacking |

### Allowed Combinations

| Product Class | Required Tagging Class | Optional Tagging Class |
| --- | --- | --- |
| `main_product` | `unit_service` | `carton_activation`, `pack_parent` |
| `spare_part` | `component_unit` if individually tracked | `pack_parent` |
| `small_part` | `small_part_batch` | `component_unit` only when the physical part is label-capable |
| `kit` | `kit_parent` | `component_unit` on child parts |
| `pack` | `pack_parent` | child tags based on contents |

### Rule

Do not infer product class from symbology. Product class is a catalog decision. Tagging class is an operational decision. Symbology is a rendering decision.

## 2. When To Use QR vs Data Matrix vs Pack-Level Or Kit-Level Tags

### QR Code

Use QR for anything that must be scanned by a normal smartphone camera in the field without a dedicated industrial scanner.

Default QR use cases:

- `main_product` `unit_service`
- `main_product` `carton_activation`
- `kit_parent` when a technician or installer may scan it with a phone
- `pack_parent` when warehouse or retail staff use phone cameras instead of laser or industrial scanners

Do not use QR as the default for very small parts. It wastes surface area and becomes unreliable below practical print sizes.

### Data Matrix

Use Data Matrix for dense encoding on constrained surfaces or industrial labels.

Default Data Matrix use cases:

- individually tracked `spare_part`
- `small_part`
- kit child components
- internal components not intended for customer scanning

Data Matrix should be the default symbology whenever either of these is true:

- label face is too small for a practical QR code
- the scan is technician-only or scanner-assisted rather than customer self-service

### NFC

NFC remains optional transport, not the identity itself.

Use NFC only when the manufacturer explicitly enables it for:

- premium products
- medical equipment
- environments where tap is materially better than camera scan

NFC should always resolve to the same canonical tag identity as the printed QR or Data Matrix equivalent.

### Pack-Level Tags

Use `pack_parent` tags when:

- multiple child units are handled together in dispatch, receiving, or installation
- scanning each child individually would be operationally wasteful
- the parent must represent the contents state, not only a container barcode

Do not let a pack tag replace child unit identity for serviceable main products. A pack can accelerate handling, but it must not become the only identity for a child unit that will later need customer service.

### Kit-Level Tags

Use `kit_parent` when the manufacturer wants the technician to consume or link a complete predefined set in one scan.

Examples:

- filter replacement kit
- standard installation kit
- preventive maintenance kit

If the child components matter for claims, traceability, or compliance, the kit should own child records in the backend even if only the parent tag is printed in v1.

## 3. Minimum Practical Label Sizing Guidance And Constraints

These are engineering defaults for this codebase, not vendor certification guarantees. Production rollout still requires printer and substrate qualification.

### QR Defaults

| Use Case | Minimum Practical Printed Symbol | Preferred Default |
| --- | --- | --- |
| carton activation QR | 25 mm | 25 mm |
| main product unit QR | 25 mm | 30 mm |
| main product unit QR on curved or low-contrast surfaces | 30 mm | 35 mm |
| kit or pack parent QR | 25 mm | 30 mm |

Rationale:

- the current export flow already supports `25`, `30`, and `35` mm QR outputs
- customer-facing scans should stay inside that range for reliable phone-camera use

### Data Matrix Defaults

| Use Case | Minimum Practical Printed Symbol | Preferred Default |
| --- | --- | --- |
| individually tracked spare part | 10 mm | 12 mm |
| small part pouch or strip label | 8 mm | 10 mm |
| tiny part direct label where phone scan is not required | 6 mm | 8 mm |

Constraints:

- below `10 mm`, treat the tag as technician or scanner oriented, not customer oriented
- do not promise smartphone self-scan on tiny Data Matrix labels
- if the symbol plus quiet zone cannot fit cleanly, fall back to batch or pouch tagging rather than shrinking beyond reliability

### General Print Constraints

- keep a clear quiet zone around all symbols
- do not place logos inside Data Matrix
- logo-in-center is allowed only for QR and only when error correction and contrast remain strong
- do not rely on glossy reflective laminate for tiny symbols
- for high-temperature environments, keep the existing material profile concept and extend it to every tag type

### Product Rules

- `main_product` customer-facing tags: never smaller than `25 mm`
- `spare_part` tags: prefer Data Matrix when printed area is below `25 mm`
- `small_part`: batch tag by default if the physical part cannot hold at least an `8-10 mm` symbol cleanly

## 4. Canonical Identity Model

### Core Point

The system should identify real-world assets and tags, not symbols.

Current mental model:

- sticker number identifies everything

Target mental model:

- `AssetIdentity` identifies the real-world thing
- `AssetTag` identifies a physical label or transport surface bound to that thing
- QR, Data Matrix, and NFC are just renderings of `AssetTag.publicCode`

### Why Symbology Is Only Rendering

One physical asset may need:

- a carton QR for activation
- a unit QR for service
- an NFC tap target for premium devices
- a Data Matrix on a service replacement component

If the codebase keeps treating the symbol type as the identity, every new operational case creates more branching. If the codebase resolves a stable `tagPublicCode` first, the rest of the system becomes uniform.

### Public Identifier Format

Use opaque public codes instead of numeric sticker numbers as the canonical external identifier.

Recommended format:

- internal primary key: UUID
- public code: upper-case Crockford Base32 string
- examples:
  - asset public code: `AS01K2N7Y4M8Q9R2TZ`
  - tag public code: `TG01K2N7Z5F3P6W8HJ`

Why:

- short enough for QR, Data Matrix, and NFC URI use
- avoids accidental meaning leakage
- works for all product classes
- eliminates collision with legacy route assumptions about numeric IDs

### Canonical Resolver Contract

Every tag resolves through one generic entrypoint:

- public path: `/r/{tagPublicCode}`

The rendered symbol may encode either:

- `https://warranty.feedbacknfc.com/r/{tagPublicCode}`
- or a short domain equivalent that expands to the same path

Never encode raw business meaning into the symbol payload. Keep payloads opaque and server-resolved.

## 5. Manufacturer-Admin Generation Workflow

### Dashboard Workflow

1. Manufacturer admin creates or imports catalog items.
2. For each catalog item, admin selects `productClass`.
3. Admin configures labeling policy per class.
4. Admin generates identities in a batch.
5. System creates asset rows first, then tag rows.
6. Admin exports printable or programmable outputs.
7. Downstream users scan tags and the resolver decides the experience.

### Main Product Workflow

1. Select catalog item with `productClass = main_product`.
2. Choose generation count or serial range.
3. Choose whether carton activation tags are included.
4. System creates:
   - one `AssetIdentity` per saleable unit
   - one `unit_service` tag per unit
   - optional one `carton_activation` tag per unit
5. Export:
   - product QR files
   - carton QR files
   - optional NFC encoding file
   - manifest CSV

### Spare Part Workflow

1. Select catalog item with `productClass = spare_part`.
2. Choose individually tracked or pack-tracked mode.
3. If individually tracked:
   - create one `AssetIdentity` per spare
   - create one `component_unit` tag per spare
4. If pack-tracked:
   - create child spare identities
   - create one `pack_parent` tag for the pack
   - optionally skip child printed tags in v1

### Small Part Workflow

1. Select catalog item with `productClass = small_part`.
2. Choose tracking granularity:
   - `batch_only`
   - `pack_only`
   - `unit_level`
3. Default to `batch_only` unless the manufacturer explicitly proves label viability.
4. System creates:
   - one batch asset or one pack asset
   - one `small_part_batch` or `pack_parent` tag

### Kit Workflow

1. Select catalog item with `productClass = kit`.
2. Define kit composition from component catalog items.
3. Choose whether child items get individual tags.
4. System creates:
   - one `AssetIdentity` for the kit parent
   - child relationship rows
   - one `kit_parent` tag
   - optional child `component_unit` tags

## 6. Backend Entities And Fields

## 6.1 Catalog Master

Extend `ProductModel` instead of introducing a second catalog table.

### `ProductModel` new fields

| Field | Type | Notes |
| --- | --- | --- |
| `productClass` | enum | `main_product`, `spare_part`, `small_part`, `kit`, `pack` |
| `trackingMode` | enum | `unit`, `batch`, `pack` |
| `defaultPrimarySymbology` | enum | `qr`, `data_matrix`, `nfc_qr`, `nfc_only` |
| `allowCartonActivation` | boolean | valid only for `main_product` |
| `serviceLinkRequirement` | enum | `none`, `optional_main_product_link`, `required_main_product_link` |
| `kitDefinition` | jsonb | composition only for `kit` |
| `labelProfile` | jsonb | class-level defaults for print size, material, instruction text |

Notes:

- for `main_product`, `allowCartonActivation` is usually true for retail flows
- for `spare_part`, `serviceLinkRequirement` should usually be `required_main_product_link`
- for `small_part`, `trackingMode` defaults to `batch`

## 6.2 Asset Instance

Introduce a new `AssetIdentity` table and retire the current `Product` table after migration.

### `AssetIdentity`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `publicCode` | string unique | canonical external asset code |
| `organizationId` | UUID | manufacturer owner |
| `productModelId` | UUID | catalog link |
| `productClass` | enum | copied from model for query efficiency |
| `serialNumber` | string nullable | for unit-level assets |
| `batchCode` | string nullable | for small parts or manufacturing batches |
| `lotCode` | string nullable | optional vendor lot |
| `lifecycleState` | enum | `generated`, `packed`, `sold`, `installed`, `active`, `consumed`, `retired`, `voided` |
| `warrantyState` | enum nullable | only meaningful for `main_product` |
| `parentAssetId` | UUID nullable | immediate container or kit parent |
| `rootMainAssetId` | UUID nullable | main product root for service-linked components |
| `saleable` | boolean | whether it is sold as a customer-facing item |
| `serviceable` | boolean | whether it can appear in service workflows |
| `metadata` | jsonb | install or manufacturing specifics |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

Rules:

- `main_product` must have `saleable = true`
- `spare_part` and `small_part` should have `serviceable = true`
- `rootMainAssetId` points to itself for `main_product`
- `kit` and `pack` parent assets may have child rows

## 6.3 Physical Or Digital Tag

Replace `Sticker` with `AssetTag`.

### `AssetTag`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `publicCode` | string unique | canonical resolver code used in scans |
| `assetId` | UUID | bound asset |
| `tagClass` | enum | `unit_service`, `carton_activation`, `component_unit`, `small_part_batch`, `kit_parent`, `pack_parent` |
| `symbology` | enum | `qr`, `data_matrix`, `nfc_uri` |
| `materialVariant` | enum | extend current `standard`, `high_temp`, `premium` idea |
| `printSizeMm` | int nullable | resolved print size |
| `humanLabel` | string nullable | printed human-readable text |
| `encodedValue` | string | exact payload rendered into symbol or NFC |
| `status` | enum | `generated`, `printed`, `encoded`, `applied`, `active`, `voided` |
| `activationContext` | enum nullable | `product`, `carton`, `component`, `kit`, `pack` |
| `viewerPolicy` | enum | `public`, `owner_only`, `technician_admin`, `warehouse_admin` |
| `generatedBatchId` | UUID | generation job |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

Rules:

- one `main_product` can have multiple tags
- one `carton_activation` tag never exists without a matching main product asset
- one `small_part_batch` tag may represent many identical child units via a batch asset

## 6.4 Batch Generation

Replace `StickerAllocation` with `TagGenerationBatch`.

### `TagGenerationBatch`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `organizationId` | UUID | |
| `productModelId` | UUID | |
| `productClass` | enum | copied for reporting |
| `generationMode` | enum | `unit_range`, `batch_only`, `kit_build`, `pack_build` |
| `quantity` | int | |
| `serialPrefix` | string nullable | for unit assets |
| `serialStart` | string nullable | |
| `serialEnd` | string nullable | |
| `includeCartonActivationTags` | boolean | main product only |
| `includeChildTags` | boolean | kits and packs |
| `defaultSymbology` | enum | |
| `outputProfile` | jsonb | pdf, png, csv, nfc, data matrix options |
| `allocatedById` | UUID | user |
| `createdAt` | datetime | |

## 6.5 Relationships

Introduce explicit relationships instead of inferring everything from one `stickerId`.

### `AssetRelationship`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `parentAssetId` | UUID | parent |
| `childAssetId` | UUID | child |
| `relationshipType` | enum | `contains`, `kit_component`, `pack_member`, `installed_on`, `replaced_by` |
| `quantity` | int nullable | |
| `createdAt` | datetime | |

Use this for:

- pack contents
- kit composition
- installed-on relationship between spare and main product
- replacement lineage

## 6.6 Service-Time Spare Linkage

Replace freeform `partsUsed` as the source of truth with structured usage rows.

### `ServicePartUsage`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `ticketId` | UUID | required |
| `mainAssetId` | UUID | required, must be a `main_product` |
| `usedAssetId` | UUID nullable | individually tagged spare or kit parent |
| `usedBatchAssetId` | UUID nullable | batch-tracked small part |
| `usedTagId` | UUID nullable | exact scanned tag if available |
| `productModelId` | UUID | denormalized part model |
| `usageType` | enum | `installed`, `consumed`, `returned_unused`, `removed` |
| `quantity` | decimal | allows fractional packs if needed later |
| `unitCost` | decimal | snapshot at service time |
| `lineTotal` | decimal | snapshot |
| `linkedByUserId` | UUID | technician or admin |
| `linkedAt` | datetime | |
| `claimable` | boolean | defaults true |
| `metadata` | jsonb | notes, pack breakdown, replacement reason |

`Ticket.partsUsed` can remain temporarily during migration, but after cutover it must be derived from `ServicePartUsage`, not authored independently.

## 6.7 Scan Logging

Unify `StickerScanEvent` and `ScanLog` into a generic tag-resolution event model.

### `TagScanEvent`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `tagId` | UUID | resolved tag |
| `assetId` | UUID | resolved asset |
| `organizationId` | UUID | |
| `scanSource` | enum | `qr`, `data_matrix`, `nfc`, `manual`, `unknown` |
| `viewerType` | enum | `public`, `owner_session`, `owner_verified`, `technician`, `admin`, `salesman_assisted`, `warehouse` |
| `resolvedView` | enum | `activation`, `product_view`, `ticket_view`, `component_info`, `pack_info`, `not_allowed`, `not_found` |
| `ticketId` | UUID nullable | if scan occurred inside service workflow |
| `mainAssetId` | UUID nullable | if a component resolves to a main asset context |
| `userId` | UUID nullable | |
| `ipAddress` | string nullable | |
| `userAgent` | string nullable | |
| `createdAt` | datetime | |

## 7. Scan Resolution Logic

## 7.1 Resolver Entry

All scans enter through:

- `GET /r/{tagPublicCode}`

### Resolution Order

1. Parse `tagPublicCode`.
2. Resolve `AssetTag`.
3. Resolve `AssetIdentity`.
4. Resolve parent or root relationships if relevant.
5. Resolve auth or owner verification state.
6. Resolve org settings and product-class policy.
7. Choose experience by `tagClass`, `productClass`, asset lifecycle, and viewer role.
8. Log one `TagScanEvent`.

## 7.2 Main Product Rules

### `carton_activation`

- if manufacturer mode is `plug_and_play` and asset is not activated:
  - show activation flow
- if manufacturer mode is `installation_driven`:
  - show sale registration or pre-install capture
  - do not start warranty unless installation completion policy says so
- if already activated:
  - show activation complete state and offer product-service handoff

### `unit_service`

- if pending activation and org allows unit-side activation:
  - show activation
- if active and viewer is owner:
  - show customer product or ticket view
- if active and viewer is technician:
  - show job-aware work interface
- if active and viewer is admin:
  - show asset history and ticket history

## 7.3 Spare Part Rules

### `component_unit`

- public anonymous scans never open customer service flows
- technician or admin scans outside a ticket show part identity and stock context
- technician scans inside a ticket create or update `ServicePartUsage`
- if part already linked to another closed ticket and not returned, reject reuse

## 7.4 Small Part Rules

### `small_part_batch`

- scan resolves to batch asset, not a fake individual part
- technician must enter quantity used
- batch usage creates `ServicePartUsage` with `usedBatchAssetId`
- customer scans are blocked by default

## 7.5 Kit Rules

### `kit_parent`

- scan can create one grouped `ServicePartUsage` row for the kit parent
- optionally explode into child usage rows if claim detail requires it
- if child-level accountability is required by the product model, the UI must force child confirmation before final completion

## 7.6 Pack Rules

### `pack_parent`

- scan resolves to the pack parent and its child count
- if pack is still sealed, technician or warehouse can unpack it
- partial consumption must decrement remaining quantity and create child usage or batch usage records
- pack tags never trigger customer-facing warranty activation

## 8. Service-Time Linkage Of Spare Tags To Main Product Plus Ticket

This is the most important new behavior for spares and kits.

### Required Rule

Every tagged spare used in service must be linked to:

- one `Ticket`
- one `main_product` asset
- one technician or admin actor

### Linking Flow

1. Technician opens assigned ticket.
2. Technician scans a spare, kit, or small-part batch tag from within the ticket workflow.
3. Resolver sees ticket context and validates whether the scanned asset class is allowed.
4. System creates `ServicePartUsage`.
5. On ticket completion:
   - claim amount is derived from `ServicePartUsage`
   - completion proof references linked assets
6. On customer confirmation:
   - claim payload and PDF use structured usage rows

### Validation Rules

- one individually tracked spare cannot be consumed by two resolved tickets
- one spare cannot be linked to a ticket for a different manufacturer org
- one spare cannot be linked to a main product of an incompatible model if compatibility rules are configured
- one batch tag usage requires quantity
- one kit parent can either:
  - count as a single line item
  - or explode into child rows
  - never both without explicit config

### Claim Generation Rule

`WarrantyClaim.documentation.partsUsed` must be built from `ServicePartUsage`, not from ad hoc ticket JSON. Freeform notes remain allowed, but financial and traceability logic must use structured rows only.

## 9. Settings For Plug-And-Play Vs Installation-Driven Manufacturers

Keep settings under the existing organization settings pattern in phase 1, then move to typed persistence if needed later.

### New Manufacturer Label Settings

Add to normalized settings:

| Setting | Type | Meaning |
| --- | --- | --- |
| `activationMode` | enum | `plug_and_play` or `installation_driven` |
| `defaultMainProductSymbology` | enum | `qr`, `nfc_qr`, `nfc_only` |
| `defaultSpareSymbology` | enum | `data_matrix` or `qr` |
| `defaultSmallPartTrackingMode` | enum | `batch`, `pack`, `unit` |
| `allowUnitSideActivation` | boolean | allow activation from unit tag |
| `requireInstallerCompletion` | boolean | required for installation-driven |
| `requireInstallationLocation` | boolean | install geo or address capture |
| `requireSpareTagScanForClaim` | boolean | claim cannot finalize without structured spare linkage |
| `allowPackWithoutChildTags` | boolean | operational simplification |
| `allowKitWithoutChildTags` | boolean | operational simplification |
| `customerVisibilityForComponents` | enum | `hidden`, `summary_only`, `full` |

### Plug-And-Play Manufacturers

Use when:

- the product can be self-installed or retailer-activated
- warranty starts near sale or first use

Defaults:

- `activationMode = plug_and_play`
- `allowUnitSideActivation = true`
- carton activation recommended, not mandatory
- main-product QR default

### Installation-Driven Manufacturers

Use when:

- installation or commissioning determines warranty start
- technician or dealer must verify site readiness

Defaults:

- `activationMode = installation_driven`
- `allowUnitSideActivation = false`
- carton scan may pre-register the sale, but does not activate warranty
- installation completion writes the real activation timestamp
- location and installer identity are required

## 10. Print And Export Requirements

## 10.1 Export Outputs

Every generation batch must support:

- print-ready PDF sheets
- individual PNG or SVG files
- CSV manifest
- NFC encoding export when NFC is enabled
- Data Matrix export for component tags

### CSV Manifest Required Columns

- `tag_public_code`
- `asset_public_code`
- `product_model_id`
- `product_class`
- `tag_class`
- `symbology`
- `encoded_value`
- `serial_number`
- `batch_code`
- `parent_asset_public_code`
- `root_main_asset_public_code`
- `material_variant`
- `print_size_mm`

## 10.2 Print Profiles

The existing material variant idea should be extended to all tag types:

- `standard`
- `high_temp`
- `premium`

Add per-profile defaults:

- adhesive class
- laminate or overprint type
- max temperature guidance
- preferred symbol contrast profile

## 10.3 Rendering Rules

- QR export must support `25`, `30`, and `35 mm` for customer-facing tags
- Data Matrix export must support at least `8`, `10`, and `12 mm`
- pack and kit labels must include human-readable context such as `KIT`, `PACK`, or `SERVICE PART`
- customer-facing main product labels may include instruction text
- technician-only labels should prefer concise human-readable IDs over marketing copy

## 10.4 NFC Export

NFC export must emit the same resolver URL as the printed tag for that `AssetTag`.

Do not allow NFC-only codes that bypass the generic resolver model.

## 11. Operational Edge Cases And Validation Rules

### Identity And Generation

- reject duplicate public codes
- reject overlapping serial ranges for the same catalog item where uniqueness is required
- reject `carton_activation` generation for non-`main_product` classes
- reject `small_part` unit tagging when chosen print size is below configured viability threshold

### Lifecycle

- reject activation on `spare_part`, `small_part`, `kit`, and `pack`
- reject customer-service ticket creation from `component_unit`, `small_part_batch`, `kit_parent`, and `pack_parent` unless explicitly enabled by model policy
- reject linking a consumed or retired spare to a new ticket

### Relationship Integrity

- reject a child asset belonging to two active kit parents unless the relationship type explicitly allows shared membership
- reject pack unpacking if pack state is already `unpacked` or `voided`
- reject service part linkage when `mainAssetId` is missing for a product model that requires it

### Service Workflow

- reject technician completion when structured spare linkage is required and no `ServicePartUsage` exists
- reject claim auto-generation if financial line totals do not reconcile to structured usage rows
- reject reuse of a component tag already marked `installed` on another live asset unless it is first marked `removed`

### Scan Handling

- unresolved tag returns `not_found`
- resolved but unauthorized tag returns `not_allowed`
- carton tag after activation should not reopen activation
- pack or kit scan without ticket context should not silently create service usage

## 12. Phased Implementation Plan

## Phase 0: Domain Cutover Decision

Deliverables:

- approve terminology
- approve hard cutover to `AssetIdentity`, `AssetTag`, and `TagGenerationBatch`
- freeze new work on `Sticker`-specific feature additions

Decision note:

- do not add more features to `Sticker`, `Product`, or `StickerAllocation`
- all new label logic should target the new generic domain

## Phase 1: Schema And Resolver Foundation

Deliverables:

- Prisma migration adding:
  - `AssetIdentity`
  - `AssetTag`
  - `TagGenerationBatch`
  - `AssetRelationship`
  - `ServicePartUsage`
  - `TagScanEvent`
- extend `ProductModel` with class and policy fields
- add generic resolver route `/r/[code]`

Likely code touchpoints:

- `prisma/schema.prisma`
- new resolver page under `src/app/r/[code]/page.tsx`
- new normalization utilities in `src/lib`

Acceptance:

- any generated tag can resolve through `/r/{code}`
- no product-class logic is stored in URL shape

## Phase 2: Manufacturer Settings And Catalog Generalization

Deliverables:

- extend manufacturer settings API and UI for:
  - `activationMode`
  - symbology defaults
  - small-part tracking defaults
  - spare-link enforcement
- extend product model creation and editing for `productClass` and label policy

Likely code touchpoints:

- `src/app/api/manufacturer/settings/route.ts`
- `src/components/manufacturer/settings-client.tsx`
- `src/app/api/manufacturer/product-model/route.ts`
- `src/components/manufacturer/product-models-client.tsx`

Acceptance:

- manufacturer admin can define main products, spares, small parts, kits, and packs in one catalog surface

## Phase 3: Generation Engine Cutover

Deliverables:

- replace current allocation flow with batch generation by product class
- generate asset rows before tag rows
- add Data Matrix export support
- keep QR and NFC export but source them from `AssetTag`

Likely code touchpoints:

- replace `src/app/api/manufacturer/allocate/route.ts`
- replace `src/app/api/manufacturer/allocate/validate/route.ts`
- replace QR and NFC generation routes
- replace `src/components/manufacturer/sticker-wizard-client.tsx`

Acceptance:

- manufacturer admin can generate:
  - main product unit tags
  - carton activation tags
  - spare component tags
  - small-part batch tags
  - kit parent tags
  - pack parent tags

## Phase 4: Public And Role-Aware Scan Resolution

Deliverables:

- move activation and public scan logic onto the generic resolver
- preserve role-aware behavior from the current `/nfc` flow
- block non-customer assets from opening customer-service flows

Likely code touchpoints:

- replace `src/app/nfc/[id]/page.tsx` behavior with generic resolver logic
- remove `/q/[id]` and `/c/[id]` assumptions in favor of `tagClass`
- replace `src/app/api/sticker/lookup/route.ts`

Acceptance:

- scan resolution depends on `tagClass`, `productClass`, lifecycle, and viewer role
- not on route family or numeric sticker number

## Phase 5: Service-Time Spare Linkage

Deliverables:

- add technician scan-and-link flow for spares, small parts, kits, and packs
- create `ServicePartUsage`
- derive claim parts and cost from structured usage rows

Likely code touchpoints:

- `src/app/api/ticket/[id]/complete/route.ts`
- `src/app/api/ticket/[id]/confirm/route.ts`
- technician job APIs and technician UI
- staff sticker views in `src/components/nfc/staff-sticker-views.tsx`

Acceptance:

- tagged spare usage is linked to both main asset and ticket
- claim generation uses structured rows only

## Phase 6: Migration And Cleanup

Deliverables:

- one-time migration of existing pilot data into new entities
- remove old sticker-specific routes and helpers
- remove old Prisma models once production data is cut over

Remove:

- `Sticker`
- `Product`
- `StickerAllocation`
- `StickerScanEvent`
- `ScanLog`
- sticker-number-specific parser assumptions

Acceptance:

- no runtime path depends on legacy sticker-number-first resolution

## Recommended Implementation Order In This Repo

1. Prisma schema and generic types
2. settings and catalog admin
3. generation APIs and export bundle
4. generic resolver page
5. technician spare-link workflow
6. claim derivation from structured usage
7. legacy removal

## Non-Goals For V1

- GS1-specific barcode semantics
- direct-marked industrial verification logic
- warehouse ERP synchronization beyond CSV and webhook-ready manifests
- multi-tenant shared part catalog across manufacturers

## Final Recommendation

Use a single generic asset-plus-tag architecture and stop expanding the current sticker abstraction. The finished-goods flow in this repo is already sound. The correct move is to preserve the existing customer and technician experience, but re-found it on:

- `ProductModel` as the generalized catalog master
- `AssetIdentity` as the real-world object
- `AssetTag` as the scan surface
- `ServicePartUsage` as the service truth

That gives the codebase a clean path from today's carton and product QR flow to a full manufacturer-admin managed identity system for finished goods, spares, small parts, kits, and packs.
