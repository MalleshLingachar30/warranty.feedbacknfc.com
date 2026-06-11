# BPL Application Gap Analysis

Date: 2026-06-03

Reference specification:
- [BPL Specification](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/docs/bpl-medical-post-sales-and-inhouse-service-platform-specification-2026-05-21.md:1)

## Purpose

This document compares the current application against the BPL Medical post-sales and in-house service specification. The objective is to identify what is already supported, what exists only as a partial foundation, what is still missing, and how the remaining work should be phased.

## Summary

The application already supports the core installation-driven warranty model and the generic service ticket flow with traced part usage. That means the platform foundation is directionally aligned with the BPL requirement.

The main gaps are not in the basic QR/warranty architecture. They are in the BPL-specific operational layers:
- SAP inbound integration framework
- BPL and distributor/service-agency onboarding model
- spare dispatch and reverse-logistics control
- calibration and scheduled maintenance
- in-house depot service workflow

## Implemented

### 1. Installation-driven warranty activation

The application already supports warranty activation only after installation completion for installation-driven models.

Current coverage:
- product models can be configured for `installation_driven`
- installation ownership rules are enforced
- customer acknowledgement can be required at installation time
- installation report submission activates the product and warranty
- QR/resolver flow correctly shows pending-installation state before activation

Relevant implementation:
- [src/app/api/installation-jobs/[id]/report/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/installation-jobs/[id]/report/route.ts:445)
- [src/app/api/warranty/activate/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/warranty/activate/route.ts:1)
- [src/app/r/[code]/page.tsx](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/r/[code]/page.tsx:471)

### 2. Asset identity and tag model

The application already uses a generic asset identity model that can support QR, Data Matrix, and related tags across main products and parts.

Current coverage:
- one asset identity model for serialized units and parts
- tag generation batches support multiple symbologies
- QR/Data Matrix generation is already present at the platform level

Relevant implementation:
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:394)
- [src/components/manufacturer/sticker-wizard-client.tsx](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/manufacturer/sticker-wizard-client.tsx:616)

### 3. Generic service ticket completion with traced part linkage

The field-service ticket workflow already supports technician completion, photo capture, labor capture, part usage capture, and customer confirmation.

Current coverage:
- technician completes work with notes and photos
- part usage can be linked to the main machine
- customer confirmation moves the ticket to resolved state
- claim generation can happen after confirmation

Relevant implementation:
- [src/app/api/ticket/[id]/complete/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/complete/route.ts:144)
- [src/app/api/ticket/[id]/confirm/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/confirm/route.ts:389)
- [src/lib/job-part-usage.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/job-part-usage.ts:43)

### 4. Installation job and technician assignment baseline

The application already has the baseline concepts needed for installation and service execution.

Current coverage:
- installation jobs exist
- service centers and technicians exist
- technician queues and assignment flows exist

Relevant implementation:
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:701)
- [src/app/api/service-center/technicians/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/service-center/technicians/route.ts:133)

## Partially Implemented

### 1. Serialized sales-line handling for installation-driven products

The application can already store serialized sales-line information against an asset, but this is not yet a full SAP integration framework.

What exists:
- `serializedSalesLine` and `saleRegistration` records can be created or updated
- installation-driven sale registration is supported in the app layer

What is still missing:
- external connector framework
- staging and validation queue
- mapping profiles
- run history and replay controls
- operational error quarantine for failed imports

Relevant implementation:
- [src/app/api/manufacturer/sale-registrations/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/manufacturer/sale-registrations/route.ts:235)

### 2. Technician onboarding

There is already a technician model and onboarding UI, but it is generic and not sufficient for BPL’s operating model.

What exists:
- technician profiles linked to service centers
- name, phone, email, skills, availability, and concurrency settings
- service-center-level onboarding UI

What is still missing:
- BPL employee code and structured technician master import
- BPL technician vs distributor technician distinction
- approval and authorization workflow
- branch/zone ownership
- technician specialization for capital items
- service-agency linkage and governance

Relevant implementation:
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:733)
- [src/app/api/service-center/technicians/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/service-center/technicians/route.ts:180)
- [src/components/service-center/add-technician-dialog.tsx](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/service-center/add-technician-dialog.tsx:48)

### 3. Part traceability policy support

The backend already supports part-traceability rules and linked part usage, but the BPL service workflow is only partially represented.

What exists:
- linked part usage validation
- prevention of conflicting active linkage for tracked parts
- support for different usage types
- policy fields for small-part tracking and included kit definition

What is still missing:
- explicit spare-dispatch lifecycle before replacement
- field UX for BPL master-spare plus small-parts checklist
- reverse-logistics handling for removed parts

Relevant implementation:
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:373)
- [prisma/schema.prisma](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma:609)
- [src/lib/job-part-usage.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/job-part-usage.ts:175)
- [src/components/technician/job-detail.tsx](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/job-detail.tsx:448)

### 4. Customer confirmation after service

The application already supports customer confirmation after technician completion, but it is still a generic confirmation model rather than the richer BPL closure-proof model.

What exists:
- ticket moves to `pending_confirmation`
- owner verification is required for final confirmation
- customer rating is captured

What is still missing:
- structured closure acknowledgement for replaced parts
- explicit acknowledgement for old-part handover or return expectation
- service-signoff format comparable to installation proof where required by business policy

Relevant implementation:
- [src/app/api/ticket/[id]/complete/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/complete/route.ts:290)
- [src/app/api/ticket/[id]/confirm/route.ts](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/confirm/route.ts:372)

## Missing

### 1. SAP inbound integration framework

This is the biggest platform gap for BPL.

Missing capability:
- inbound connector framework for SAP
- import staging layer
- mapping and transformation profiles
- idempotent import runs
- replay and retry handling
- operational monitoring and failure quarantine

Impact:
- current data ingestion is app-driven, not integration-driven
- this limits production-grade ERP synchronization and operational control

### 2. Distributor and service-agency master model

The current service-center model is too generic for the BPL distributor and service-agency operating structure.

Missing capability:
- distributor master
- service-agency master
- linkage between distributor, agency, service center, and technician
- approval state for partner technicians
- zonal and branch ownership model

Impact:
- partner service governance cannot be represented cleanly
- assignment and accountability rules remain weaker than required

### 3. Spare dispatch lifecycle

The application captures spare usage at job completion, but not the full pre-use dispatch chain.

Missing capability:
- HO or zonal spare dispatch record
- dispatch to technician or service center
- in-transit or received state
- pending-installation vs installed state
- unused spare return state

Impact:
- BPL cannot fully track where a spare is between issue and actual replacement

### 4. Old-part return and reverse logistics

This is currently absent as a structured workflow.

Missing capability:
- return-expected marker when old part is removed
- custody states across technician, distributor, zone, transit, and head office
- overdue return tracking
- head-office receipt acknowledgement
- exception reporting for not-returned items

Impact:
- the platform cannot support the BPL requirement for full return accountability and reverse traceability

### 5. Calibration and scheduled maintenance

This area does not appear in the current domain model or workflow surface.

Missing capability:
- calibration schedule configuration
- preventive maintenance frequency configuration
- due and overdue event generation
- technician execution workflow for maintenance visits
- checklist, readings, and proof capture
- reporting on due, completed, and overdue activity

Impact:
- warranty-period service obligations cannot be systematically controlled

### 6. In-house service and depot workflow

This is effectively a separate module and is not yet implemented.

Missing capability:
- intake receipt workflow
- Data Matrix affix-at-receipt process
- first-stage verification for serviceable vs discard decision
- internal repair stages
- parts consumption inside depot flow
- testing and pass/fail capture
- refurbished-ready and shipment-ready states
- depot dashboards and exception reporting

Impact:
- the second major BPL use case is currently not supported

### 7. BPL-specific master-spare and small-parts workflow UX

There is policy groundwork in the backend, but not the intended technician workflow.

Missing capability:
- scan master spare
- auto-show predefined child small parts
- checkbox capture of actual subcomponents used
- service history that clearly records both master spare and child items

Impact:
- the field process will remain cumbersome for practical multi-part replacements

## Phase 1 / Phase 2 Recommendation

### Phase 1

Phase 1 should focus on the operational foundation required to run BPL’s installed-equipment service model end to end.

Recommended scope:
- SAP inbound integration for serialized sales and dispatch lines
- SAP inbound technician master for BPL technicians
- SAP inbound distributor and service-agency master
- SAP inbound item master for main products and spares
- BPL-aware technician and partner onboarding model
- installation-driven warranty activation finalization
- service ticket flow hardening for BPL
- spare dispatch lifecycle
- replacement traceability on the machine
- old-part return lifecycle and exception reporting
- customer confirmation and richer service closure proof
- master-spare plus small-parts checklist workflow

Reasoning:
- this phase closes the core post-sales field-service gap
- it creates the minimum operating system for BPL’s warranty, service, and spare accountability model

### Phase 2

Phase 2 should extend the platform into preventive servicing and internal depot operations.

Recommended scope:
- calibration scheduling
- preventive maintenance scheduling
- warranty-period service obligations and reporting
- full in-house service workflow
- intake labeling with Data Matrix
- serviceability verification and discard workflow
- repair, testing, refurbishment, and shipment stages
- depot dashboards and operational exception reporting

Reasoning:
- these flows are substantial and operationally distinct
- they can reuse the same identity and traceability base built in Phase 1
- keeping them in Phase 2 reduces delivery risk and avoids overloading the first rollout

## Suggested Next Step

The next planning document should turn the missing and partial areas into a build backlog with:
- domain entities
- API modules
- UI modules
- SAP inbound data contracts
- reporting requirements
- rollout sequence

That backlog should start with Phase 1 only.
