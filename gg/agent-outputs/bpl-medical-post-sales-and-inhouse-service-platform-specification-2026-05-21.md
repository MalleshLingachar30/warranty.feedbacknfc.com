# BPL Medical Technologies

## Post-Sales Traceability, Installation-Activated Warranty, Spare Control, and In-House Service Platform Specification

Date: 2026-05-21  
Prepared for: BPL Medical Technologies  
Document type: client-facing solution specification  
Prepared in context of: `warranty.feedbacknfc.com`

## 1. Executive Summary

This document proposes a two-part digital operations platform for BPL Medical Technologies:

1. An installation-activated warranty, field service, and spare traceability platform for serialized medical equipment sold through the channel but installed by the company.
2. An internal in-house service workflow platform for received return items, depot repairs, refurbishment, testing, and shipment readiness.

The two solutions are related but distinct. The first solves installed-base visibility, warranty governance, field-service proof, spare-to-machine traceability, old-part return control, and customer closure proof. The second solves in-house service accountability, stage visibility, repair status tracking, testing control, and refurbishment readiness for items physically received into the service department.

The recommended operating principle is:

- SAP remains the system of record for commercial invoicing and inventory accounting.
- The platform becomes the execution, traceability, proof, and control layer after dispatch, during installation, during service, during spare replacement, during old-part return, and during depot repair.

This is not a simple warranty card solution. It is a post-sales control platform for serialized equipment and serialized spares.

## 2. Business Context

BPL Medical Technologies operates in a medical equipment environment where:

- Main equipment is serialized and invoiced through SAP.
- Equipment is typically invoiced first to distributors or channel partners.
- Final customer identity is often known only at installation time.
- Installation is performed by BPL.
- Warranty must start only after installation is completed and the installation report is submitted with customer signoff.
- Future service events must be linked to the installed machine and its warranty state.
- Spare issuance and spare replacement must be fully traceable.
- Old replaced items must be returned and accounted for.
- Internal service departments also handle large volumes of returned items that need stage-by-stage visibility from receipt to refurbishment and shipment readiness.

## 3. Solution Overview

The proposed solution has two operational modules.

## 3.1 Solution A: Installed Equipment, Warranty, Field Service, and Spare Traceability

This module manages:

- serialized equipment identity
- QR code tagging on main equipment
- installation-triggered warranty activation
- installation report capture
- service ticket creation through QR scan
- warranty-aware service execution
- spare dispatch and spare replacement traceability
- customer signoff on service completion
- old-part return tracking
- zonal-office and head-office visibility
- exception reporting for non-returned items and pending closures

## 3.2 Solution B: In-House Service and Refurbishment Workflow

This module manages:

- receipt of items physically arriving at the service department
- affixing Data Matrix labels to incoming items
- first scan to register receipt
- second scan to register work-start or repair activity
- technician mobile updates during repair
- spare usage recording during internal service
- testing-stage movement
- final scan to mark refurbished and ready for shipment
- real-time dashboard visibility for service leadership

## 4. Core Design Principle

The platform should use one common identity and traceability backbone, but expose two operational workflows:

- field post-sales workflow for installed equipment
- internal depot/in-house repair workflow for received items

These should share:

- identity and scan infrastructure
- user and role controls
- audit trail
- part usage capture
- return and exception logic
- dashboard and reporting foundations

They should remain separate in execution because the actors, proof requirements, and business events are different.

## 5. Solution A: Installed Equipment and Post-Sales Traceability Specification

## 5.1 Business Objective

BPL needs a workflow where:

- equipment is invoiced from SAP to distributors
- every serialized equipment unit carries a QR code
- warranty does not start on invoice date
- warranty does not start on QR scan by the customer
- warranty starts only after BPL completes installation and captures a valid installation report signed by the customer
- every future service action can be tied back to the installed unit
- every spare sent for that unit can be tied to the service ticket and the actual machine
- replaced old parts are recoverable and accountable

## 5.2 Main Business Rule

For BPL installation-driven equipment:

- QR code on the main machine is not the warranty activation trigger
- installation report submission is the only warranty activation trigger
- customer signature or equivalent customer acknowledgement is mandatory
- service can be raised through QR scan after installation is completed

## 5.3 Actors

The workflow should support at minimum these actors:

- BPL manufacturer admin
- BPL service head
- BPL call center / service desk
- BPL zonal office / regional service coordinator
- BPL warehouse / spare dispatch team
- BPL field service engineer / technician
- distributor or dealer, where limited visibility is needed
- customer / hospital / site representative

## 5.4 Master Objects

The following business objects are required:

- main equipment model
- serialized main equipment unit
- equipment QR tag
- distributor master
- dealer master where applicable
- customer / hospital / site record
- installation job
- installation report
- warranty record
- service ticket
- spare master
- serialized spare unit or spare batch
- spare QR tag
- master spare definition
- small-parts checklist under a master spare
- part usage record
- old-part return record
- return receipt record
- zonal office ledger
- head-office return receipt ledger

## 5.5 Required Tagging Policy

### Main Equipment

- Every serialized main equipment unit must carry a QR code.
- The QR code must resolve to the machine identity in the platform.
- Before installation, the QR code must identify the unit as sold/pending installation.
- After installation, the same QR code must identify the unit as active and serviceable.

### Spare Parts

- Every serviceable high-value spare dispatched against field service must carry a QR code.
- If a spare is itself serialized, the QR code must resolve to that exact spare identity.
- If a spare is tracked at pack, kit, or batch level, the tag must resolve to the correct parent traceability object.

### Small Components

Very small items such as screws, washers, O-rings, seals, clips, and similar low-size sub-components may not be individually taggable.

For these items:

- the platform must support master-spare-based traceability
- the technician must scan the master spare
- the platform must show the predefined list of small components contained under that master spare
- the technician must check which small components were actually used or replaced
- the selected components must be stored against the same service ticket and main equipment unit

This ensures operational traceability without forcing impractical tagging on micro-components.

## 5.6 Operational Flow A1: SAP Invoice to Installed Asset Readiness

1. Equipment master and serialized invoice data are imported from SAP.
2. The system creates or updates the serialized equipment identity in the platform.
3. Each unit is issued a QR code identity for field visibility and future service.
4. The unit is marked as sold into the channel but pending installation.
5. Since the invoice is to a distributor, customer identity remains unknown or provisional at this stage.
6. The unit is visible to BPL operations as dispatched but not yet installed.

## 5.7 Operational Flow A2: Installation-Activated Warranty

1. BPL schedules installation for the machine.
2. BPL field engineer visits the customer site.
3. Engineer opens the installation job on mobile.
4. Engineer captures installation report data.
5. Engineer captures customer and site details.
6. Engineer captures serial number confirmation.
7. Engineer captures required proof such as photos, geo-location, commissioning checklist, and any other mandatory fields.
8. Customer signs or digitally acknowledges installation completion.
9. Once the installation report is submitted and validated, warranty starts immediately from installation date.
10. The installed asset becomes active for future service and traceability.

## 5.8 Installation Report Required Fields

The installation report should capture at minimum:

- equipment serial number
- equipment model
- SAP invoice reference or dispatch reference
- installation job number
- installation date
- customer / hospital name
- department / ward / lab / site name as applicable
- address, city, state, pincode
- contact person name
- contact phone
- contact email if available
- engineer name
- engineer employee or technician code
- commissioning checklist responses
- calibration / test parameters where applicable
- geo-location
- before/after photos where required
- customer signature or digital acknowledgement
- remarks / deviations / pending observations

## 5.9 Warranty Rules

The platform must support these warranty rules:

- invoice date is not the warranty start date for installation-driven equipment
- warranty start date equals valid installation completion date
- warranty period must be stored against the equipment model and applied on activation
- the machine QR code may be scanned before installation, but that scan must not activate warranty
- if installation is incomplete or unsigned, warranty must remain pending
- future service tickets must automatically evaluate whether the equipment is within warranty or out of warranty
- replaced spare warranty windows, such as 90-day replacement part warranty, should be configurable

## 5.10 Operational Flow A3: Service Request Through QR Scan

1. Customer or BPL service staff scans the QR code on the installed machine.
2. The platform identifies the exact machine and its warranty state.
3. A service request or complaint is created against that machine.
4. Call center, zonal office, or service coordinator assigns the ticket.
5. Technician receives the ticket with equipment, site, and warranty context.
6. Service activity is executed and logged against the same equipment identity.

## 5.11 Service Ticket Required Fields

The service ticket should capture:

- ticket number
- machine identity
- QR scan source
- customer and site identity
- warranty status at ticket creation
- complaint type
- complaint description
- severity / priority
- assigned zone / branch / service center
- assigned technician
- parts requested
- parts issued
- work performed
- customer signoff
- closure status

## 5.12 Operational Flow A4: Spare Dispatch and Replacement Traceability

1. A service ticket determines that a spare is required.
2. The spare may be dispatched from head office, regional office, or zonal office depending on operating model.
3. The spare dispatch must be linked in the platform to:
   - the ticket
   - the target machine
   - the target site
   - the receiving location or technician
4. The spare itself carries a QR code.
5. At time of replacement, the technician scans:
   - the main equipment QR code
   - the spare QR code
6. The platform records that the specific spare was actually installed on that specific machine under that specific ticket.
7. If the spare is a master spare with smaller sub-parts, the technician must select the exact small components used from the master checklist.
8. The part usage entry becomes part of the permanent service history.

## 5.13 Small-Part Traceability Under a Master Spare

This is a mandatory capability for BPL.

The system must support a master spare definition that includes:

- master spare code
- master spare description
- list of small included items
- quantity per item
- whether each small item is mandatory, optional, or consumable

When the master spare is scanned during service:

- a structured checklist must appear on mobile
- technician must tick the specific smaller parts actually used
- quantity should be editable where required
- the final saved record must show both:
  - the master spare replaced
  - the actual smaller items consumed under it

This data must appear in:

- service ticket history
- machine service history
- spare usage ledger
- return and exception reports where applicable

## 5.14 Operational Flow A5: Customer Signoff and Service Closure

1. After service activity is completed, technician records work performed.
2. Technician records replaced spare and any associated small items.
3. Customer verifies that service has been performed.
4. Customer signs or digitally acknowledges closure.
5. Ticket is moved to closed only after required fields and acknowledgement are complete.

Closure proof should include:

- technician identity
- timestamp
- location
- work summary
- parts replaced
- customer acknowledgement

## 5.15 Operational Flow A6: Old-Part Return and Reverse Traceability

1. When a spare is replaced, the removed old item must be marked as return expected.
2. The return obligation must be linked to:
   - the ticket
   - the machine
   - the replacement spare
   - the old removed item
   - the responsible field location, technician, or distributor point
3. Until the old item is received back, the system must show it as pending return.
4. If the old part is first held at distributor or zonal office, that location must be recorded.
5. When the old item reaches head office, the platform must record receipt and update inventory/return status.
6. If the old item is not returned within defined SLA, it must appear in exception reports.

## 5.16 Old-Part Return Statuses

Suggested statuses:

- return_expected
- collected_from_customer
- held_at_technician
- held_at_distributor
- held_at_zonal_office
- in_transit_to_head_office
- received_at_head_office
- inspected
- scrapped
- refurbished_to_inventory
- return_overdue
- return_unreconciled

## 5.17 Required Dashboards for Solution A

### Service Head Dashboard

The service head should be able to see:

- total installed base
- total machines pending installation
- total machines under warranty
- total open service tickets
- tickets by zone
- tickets by aging
- tickets needing spare dispatch
- tickets pending customer signoff
- old parts pending return
- old parts received at zonal offices but not yet at head office
- spare replacement history by machine, zone, and model

### Zonal Office Dashboard

The zonal office should be able to see:

- open tickets in zone
- spares dispatched to zone
- spares pending installation confirmation
- old parts pending collection
- old parts pending dispatch back to head office
- overdue returns

### Machine-Level Traceability View

For any single machine, BPL should be able to view:

- SAP dispatch reference
- distributor / channel reference
- installation date
- warranty start and expiry
- full complaint history
- full service history
- all spares ever replaced
- all small parts logged under major spare replacements
- customer acknowledgements
- outstanding return obligations

## 5.18 Exception Reports for Solution A

The platform must provide at minimum these exception reports:

- installed machines missing signed installation reports
- machines dispatched from SAP but still not installed
- machines serviced without completed closure acknowledgement
- spares issued but not yet scanned as installed
- spares scanned as installed but old parts not marked return expected
- old parts pending at distributor
- old parts pending at zonal office
- old parts overdue for return to head office
- high-value spares with unresolved return status
- machines with repeated failures or repeated spare replacements

## 6. Solution B: In-House Service, Refurbishment, and Testing Workflow Specification

## 6.1 Business Objective

BPL also needs an internal service workflow for items physically received at the service department. The objective is to create a frictionless, scan-based process so the service head knows at all times:

- how many items have been received
- how many are under diagnosis
- how many are under repair
- how many are waiting for parts
- what spares have been replaced
- how many are in testing
- how many are refurbished and ready for shipment

## 6.2 Core Rule

Every item received into the service department must be brought into digital traceability at the point of receipt, even if it did not originally carry a factory QR code.

The proposed mechanism is:

- affix Data Matrix label at service entry
- use scan events to advance the item through the internal workflow

## 6.3 Actors

This module should support:

- service entry operator
- depot / workshop technician
- testing / QA operator
- service head
- inventory / dispatch operator

## 6.4 Required Identity Model for In-House Items

Each received item should have:

- received item ID
- Data Matrix label
- product / item type
- original serial number if available
- customer / source information
- receipt date
- received condition
- linked service case or repair order if available

## 6.5 Operational Flow B1: Receipt at Service Entry

1. Item arrives at service department.
2. Service entry operator creates a receipt entry.
3. Data Matrix label is printed and affixed.
4. First scan records receipt of the item.
5. Item status becomes `received`.

The receipt entry should capture:

- source customer or branch
- source city / site / dealer / hospital
- original serial number if available
- received item category
- accessories received
- visible condition
- complaint / issue summary
- receipt timestamp
- receiver identity

## 6.6 Operational Flow B2: Diagnosis or Work Start

1. Technician takes custody of the item.
2. Technician scans the Data Matrix label.
3. Second scan moves the item into diagnosis or repair-in-progress status.
4. Technician records the nature of activity to be performed.

Suggested statuses:

- received
- under_inspection
- estimate_pending
- waiting_for_parts
- repair_in_progress
- repaired_pending_test
- under_testing
- test_failed
- test_passed
- refurbished_ready
- packed_for_shipment
- shipped
- cancelled

## 6.7 Operational Flow B3: Repair Activity and Spare Usage

During repair, technician must be able to update on mobile:

- diagnosis findings
- action performed
- spares replaced
- smaller items consumed
- pending dependencies
- remarks

If parts are used internally:

- the spare or master spare must be selected or scanned
- smaller included items must be selectable where relevant
- all used items must become part of the repair history for that received unit

## 6.8 Operational Flow B4: Testing

1. After repair, the item is scanned into testing.
2. Testing operator records test start.
3. Testing operator records test outcome.
4. If failed, the item returns to repair with failure reason.
5. If passed, the item moves to refurbished-ready status.

Testing should capture:

- test date
- tester identity
- test parameters
- pass/fail result
- remarks
- rework requirement if failed

## 6.9 Operational Flow B5: Refurbished and Ready for Shipment

1. Final scan marks the item as refurbished and ready for shipment.
2. Packing or dispatch operator updates shipment readiness.
3. If shipment details are available, the platform can capture outbound dispatch reference.

This flow gives the service department a live operational queue instead of a paper or memory-driven process.

## 6.10 Dashboards for Solution B

The service head dashboard should show:

- total items received today
- total items in inspection
- total items waiting for parts
- total items under repair
- total items under testing
- total items failed in testing
- total items refurbished-ready
- total items shipped
- average turnaround time
- technician-wise load
- technician-wise closure
- pending aging buckets by stage

## 6.11 Exception Reports for Solution B

The system should provide:

- received items not moved beyond entry within SLA
- items stuck in repair
- items stuck waiting for parts
- items stuck in testing
- repeated test failures
- items marked repaired but not tested
- refurbished-ready items not shipped
- technician backlog report
- stage-wise aging report

## 7. SAP Integration Specification

## 7.1 SAP Positioning

SAP should remain the commercial and inventory system of record. The platform should not attempt to replace SAP. Its role is to convert SAP transactions into post-sales operational traceability and field execution control.

For BPL, SAP integration is important, but the direction of integration should be phased.

Recommended principle:

- inbound from SAP is mandatory in phase 1
- outbound to SAP is recommended in phase 2 where accounting, inventory reconciliation, and status harmonization are required

## 7.2 Mandatory Inbound Integration from SAP

The platform should import the following from SAP:

- equipment item master
- equipment model master
- serialized equipment invoice lines
- serial numbers for invoiced main equipment
- distributor master
- dealer master if applicable
- branch, region, zone, and warehouse master
- spare master
- serviceable spare classification
- high-value spare serials where available
- spare issue or dispatch references
- stock point / warehouse references
- customer reference where SAP already has it

## 7.3 Purpose of Inbound SAP Integration

Inbound data is required so that the platform can:

- know which machine exists
- know which serial number was invoiced
- know which distributor or channel partner received it
- know which zone or branch should see it
- know which spare items exist
- know which spares are issued or dispatched
- seed downstream installation, service, and return workflows

## 7.4 Mandatory Inbound Feeds for Solution A

### Main Equipment

- item code
- item description
- model code
- model family
- serial number
- invoice number
- invoice date
- distributor code
- dealer code if available
- dispatch location
- branch or zone mapping

### Spares

- spare code
- spare description
- spare category
- serialized or non-serialized indicator
- batch number where relevant
- warehouse / stock point
- dispatch reference
- issue reference

### Organizational and Channel Masters

- distributor master
- dealer master
- branch master
- zonal office master
- warehouse master
- employee or technician master if SAP holds it

## 7.5 Additional Inbound Feeds Recommended

These are recommended even if they are not in day-one scope:

- stock transfer references
- goods issue references for spares
- return material authorization references if used
- goods receipt references for returned old items
- repair order references if managed elsewhere
- service contract / AMC / extended warranty reference data

## 7.6 Optional Outbound Integration to SAP

Outbound integration is not required to start the operational platform, but it is valuable later.

Recommended outbound events:

- installation completion confirmation
- warranty start date update
- service ticket closure summary
- spare actually installed confirmation
- old part return expected status
- old part received at head office confirmation
- refurbishment complete status
- dispatch-ready or shipped-back status for in-house service items

## 7.7 Why Outbound Can Be Deferred

The operational platform can go live and deliver value even before outbound SAP sync is implemented because:

- BPL’s immediate pain is operational traceability, not ERP replacement
- installation proof and service proof can be captured independently
- spare-to-ticket traceability can be enforced inside the platform
- return exceptions can be monitored operationally before they are fully reflected into SAP

## 7.8 SAP Integration Architecture Recommendation

Recommended architecture:

1. SAP adapter or middleware feed
2. staging layer inside the platform
3. canonical mapping layer
4. validation and reconciliation rules
5. domain application into platform entities

This architecture is preferred because SAP implementations vary. The platform should consume canonical normalized data, not hardcoded SAP field shapes.

## 7.9 Integration Control Requirements

The SAP integration layer should support:

- full audit of inbound files or messages
- idempotent reprocessing
- duplicate detection
- serial-number collision detection
- quarantining of invalid records
- run history
- integration error visibility

## 7.10 Recommended SAP Integration Phasing

### Phase 1

- item master inbound
- serialized equipment invoice inbound
- spare master inbound
- distributor / zone / warehouse master inbound

### Phase 2

- spare dispatch references inbound
- return receipt references inbound
- optional outbound warranty start updates
- optional outbound service and return events

### Phase 3

- fuller inventory and return reconciliation with SAP
- advanced service contract / AMC synchronization if required

## 8. Functional Requirements Summary

The platform must support:

- serialized equipment identity
- QR code generation and resolution
- installation report based warranty activation
- QR-based service request creation
- service ticket workflow
- technician mobile workflows
- spare scan and linkage to ticket and machine
- master spare with smaller-item checklist
- customer signoff
- old-part return accountability
- zonal and head-office visibility
- in-house service entry by Data Matrix
- repair, testing, refurbishment, and shipment readiness tracking
- service head dashboards
- exception reporting
- SAP inbound integration

## 9. Role-Based Access Requirements

Suggested access model:

- manufacturer admin: global master and reporting control
- service head: full operational visibility
- zonal office: zone-limited service and return visibility
- field technician: assigned jobs, scans, closure proof
- warehouse team: spare issue, spare dispatch, return receipt updates
- service entry operator: in-house receipt creation
- workshop technician: in-house repair updates
- testing operator: testing-stage updates
- customer: limited acknowledgement only, unless future customer portal is required

## 10. Mobile and Scanning Requirements

The platform must be mobile-first for field execution and internal floor execution.

Required scanning capabilities:

- QR scan for main equipment
- QR scan for major spares
- Data Matrix scan for service-entry labels and small-form-factor items where applicable
- multi-scan support inside a single service transaction
- scan validation with immediate feedback
- ability to continue structured data entry after scan

Recommended operational qualities:

- low-friction scan-to-action screens
- fast load on standard Android devices
- camera-based scanning
- timestamped scan history
- offline tolerance with delayed sync if feasible

## 11. Audit Trail and Compliance Requirements

Every major action should be auditable:

- who created the record
- who scanned the tag
- who submitted the installation report
- who linked the spare
- who selected small parts
- who captured customer signature
- who marked old-part return received
- who advanced the in-house item to next stage
- when each event happened
- from which device or location where applicable

## 12. Dashboards and Reports Summary

The final platform should provide:

- installed base dashboard
- warranty dashboard
- open service dashboard
- spare issuance and replacement dashboard
- old-part return dashboard
- zonal performance dashboard
- in-house service operations dashboard
- testing-status dashboard
- turnaround-time dashboard
- exception reports across field service and depot service

## 13. Implementation Scope Recommendation

## 13.1 Phase 1: Installed Equipment and Installation-Activated Warranty

- SAP inbound for serialized equipment and channel master
- QR code generation for equipment
- installation job creation
- installation report with customer signoff
- warranty activation on installation completion

## 13.2 Phase 2: Service Tickets and Spare Traceability

- QR-based service request entry
- ticket workflow
- spare linkage
- master spare plus small-part checklist
- customer service closure signoff
- old-part return expected tracking

## 13.3 Phase 3: Return Control and Exception Reporting

- zonal-office return ledger
- head-office receipt confirmation
- non-returned spare exception reporting
- aging and reconciliation reports

## 13.4 Phase 4: In-House Service Workflow

- Data Matrix label generation at service entry
- receipt scan
- repair-stage scan flow
- testing-stage scan flow
- refurbished-ready scan flow
- service head dashboards

## 13.5 Phase 5: SAP Outbound and Advanced Reconciliation

- outbound updates to SAP where needed
- return and inventory synchronization
- advanced operational finance reconciliation

## 14. Key Benefits to BPL Medical Technologies

This solution gives BPL:

- warranty start-date control based on actual installation
- visibility of distributor-invoiced but customer-installed equipment
- traceable service history at machine level
- proof of which spare was installed on which machine
- visibility of which smaller items were replaced under a master spare
- enforceable old-part return accountability
- zonal and head-office control over pending returns
- real-time view of in-house service flow
- better control over service quality, parts usage, and operational leakage

## 15. Final Recommendation

The correct positioning for BPL is not a generic warranty app.

The correct solution is a combined:

- installation-activated warranty platform
- field-service traceability platform
- spare replacement control platform
- old-part return accountability platform
- in-house service workflow platform

with SAP as the upstream commercial and inventory system of record.

This structure directly addresses BPL’s operational reality:

- invoice happens before end-customer identity
- installation is the true warranty start event
- service must be machine-specific
- spare usage must be provable
- old-part return must be accountable
- internal service flow must be digitally visible stage by stage

## 16. Open Design Decisions for BPL Confirmation

Before final implementation scoping, BPL should confirm:

- whether all installation-driven equipment is installed only by BPL engineers or whether any dealer-assisted model exists
- whether spare dispatch references originate only in SAP or sometimes outside SAP
- whether all high-value spares are serialized today or need platform-driven serialization
- which small-part families should be modeled under master spare definitions
- what customer acknowledgement mode is preferred: signature, OTP, or both
- whether in-house service items always arrive with original serial numbers or sometimes only with site tags
- whether returned old items should be booked into SAP inventory immediately on head-office receipt or after inspection
- whether AMC, calibration, and extended warranty workflows should be included in the first scope or phased later

## 17. Conclusion

BPL Medical Technologies requires a structured post-sales execution platform, not just a warranty registration layer. The first requirement is installation-led warranty governance and machine-level spare traceability in the field. The second requirement is an internal scan-driven service workflow for repair and refurbishment operations. Both can sit on one operational platform and both can coexist with SAP cleanly if SAP is treated as the source of commercial and inventory truth and the platform is treated as the operational traceability and proof layer.
