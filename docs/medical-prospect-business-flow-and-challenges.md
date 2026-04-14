# Current Business Flow and Operational Challenges

## Company Context

The prospect is a medical technology manufacturer operating through a distributor and dealer-led channel across India. The company ships approximately 24,000 to 25,000 products annually. Invoicing is handled through SAP, and product distribution is managed through regional and zonal offices located across different parts of the country.

The company maintains its own service engineer network across India and also works with dealer technicians for portions of the service process. A central call center in Bangalore, staffed by around 7 to 8 people, handles roughly 3,000 calls per month.

The installed customer base is large, with about 4.5 lakh customers in total. However, around 1.5 lakh of these customers are effectively unknown to the manufacturer at the point of initial shipment.

## Current Business Flow

### 1. Product Dispatch and Channel Movement

- Products are first invoiced through SAP.
- Products are shipped from the company into distributor and dealer channels.
- Regional and zonal offices support downstream delivery and service coordination.
- Once products move from the head office or commercial office into the channel, direct visibility begins to reduce significantly.

### 2. Sale to End Customer

- Products are typically sold first to distributors or dealers before reaching the final user.
- At the time of dispatch into the channel, end-customer details are generally not known.
- The manufacturer often becomes aware of the final customer only after installation takes place.

### 3. Installation Process

- For capital goods, the company usually sends its own engineers for installation and repair.
- For other categories of products, installation and service are commonly initiated by dealer networks through zonal offices.
- Dealer technicians or service personnel submit installation reports after installation is completed.
- These reports are often handwritten, even though the company has prescribed a standard format.
- Installation reports usually include:
  - customer details
  - serial number of the installed device
  - installation details
  - customer acknowledgement or signature

### 4. Warranty Handling

- Warranty decisions are influenced by installation timing rather than shipment timing.
- Dealers and distributors are commonly given an additional three months beyond the general warranty period so that they have sufficient time to install the product after receiving it.
- Regulatory expectations indicate that warranty should start from the installation date.
- If warranty appears valid, spare parts are usually sent without extensive questioning.
- Replaced parts are typically covered by a 90-day warranty.

### 5. Service Request and Complaint Handling

- The call center receives customer and service-related calls, usually using serial number as the main reference point.
- For capital goods, company engineers are involved directly.
- For other products, service usually flows through the dealer network and zonal offices.
- Service coordination depends heavily on manual communication across dealers, zonal offices, commercial teams, and field personnel.

### 6. Spare Parts Fulfilment

- Service requests generally come with customer identity, customer site, and product reference details, but spare fulfilment still moves through multiple internal and channel handoff points.
- If a regular spare part is required, the zonal office may supply it immediately.
- If a non-regular part is needed, the spare request first goes to the commercial team of the branch.
- The branch commercial team then routes the request to SCM through the field sales representative channel.
- The spare is then sent from the Bangalore office to the zonal office.
- From the zonal office, the spare moves to the authorized sales and service dealer, and then further to the customer site.
- For overseas customers, replacements are generally processed on request.

### 7. Repair and Return Handling

- When an item is received for repair, it comes with a site tag carrying source information, place or site information, serial number, and related identification details.
- Once green-tagged faulty devices arrive into the repair or return process, they are marked with two labels for further handling and traceability.
- After repair:
  - a green sticker indicates the item may return to inventory
  - a red sticker suggests that replacement or additional parts may still be required
- Replaced or failed parts are not always returned immediately by dealers or distributors.
- There is no dependable closed-loop mechanism to confirm where a replacement spare was actually used or whether the old part has been received back.

### 8. Calibration, AMC, Extended Warranty, and OEM Spare Obligations

- During the warranty period, calibration is carried out at two scheduled points: around the 4th month and around the 10th month.
- When the equipment invoice is generated in SAP, there is no separate line item for this service obligation.
- The expected service cost is instead factored into the main equipment invoice, generally as a percentage of the invoiced value.
- The company therefore knows that a portion of the equipment value is expected to be spent on warranty-period service delivery.
- AMC includes scheduled maintenance, but generally covers labor as the main service component.
- Extended warranty is agreed prior to sale and becomes part of the commercial commitment made to the customer.
- The manufacturer also imports certain equipment from OEMs along with specified spares.
- In some cases, the manufacturer may not know whether the originally intended spare will actually work because of version changes, design changes, or compatibility differences.
- In such cases, a new compatible spare may have to be sourced from the OEM.
- Since the manufacturer has already committed warranty support to the customer, it remains obligated to support the equipment even beyond the OEM's own warranty or compatibility coverage.

## Operational Challenges

## 1. End-Customer Visibility Is Delayed and Incomplete

- The manufacturer does not know the final customer at the time products are shipped into the channel.
- Customer identification often depends entirely on installation reports received later.
- Installation reports may be handwritten, incomplete, unclear, or difficult to interpret.
- This creates a major gap in visibility over the installed base.

## 2. Traceability Is Lost Once Products Leave Central Control

- Once items are shipped out of the head office or commercial office, end-to-end traceability weakens significantly.
- It becomes difficult to know:
  - where the product currently is
  - who the actual customer is
  - whether the product has been installed
  - whether the warranty should start
  - what service activity has already happened

## 3. No Unified Interface Across Stakeholders

- There is no common operating interface connecting:
  - manufacturer
  - distributor
  - dealer
  - service engineer
  - end customer
- As a result, invoicing, installation, warranty activation, complaint handling, service execution, and spare replacement all operate in disconnected ways.

## 4. Service Requests Lack Complete Context

- The call center often receives requests without full customer traceability.
- In many cases, serial number is the only available reference.
- Customer details are not always clearly available or legible.
- This slows service handling and reduces confidence in the accuracy of support actions.

## 5. Warranty Start and Validity Are Difficult to Govern

- Warranty is expected to begin from installation date, but installation may occur long after shipment.
- Dealers and distributors may hold inventory for a long time before installation.
- Additional warranty time is sometimes granted to account for this delay.
- This makes warranty start-date control and validation difficult.

## 6. Spare Replacement Is Weakly Controlled

- Spare parts are sent when required, but there is limited confidence around:
  - which customer they are intended for
  - which product they are meant to repair
  - which complaint triggered the request
  - whether the part was actually used as expected
- There is insufficient proof linking spare issue to actual field replacement.

## 7. Returned Defective Parts Are Not Reliably Recovered

- Dealers and distributors do not always return old or defective parts immediately.
- This creates uncertainty around:
  - whether the replacement was genuinely carried out
  - where the removed part currently is
  - how much inventory is outstanding in the field
- This also creates inventory leakage and control challenges.

## 8. Field Execution and Work Performed Are Not Connected

- Coordination of repairs, spare movement, engineer deployment, and work completion is disconnected.
- There is no consolidated view of:
  - who attended the complaint
  - what work was done
  - what spares were used
  - whether the issue was resolved
  - whether the customer acknowledged completion

## 9. Dealer Technician Dependency Creates Process Variability

- Dealer technicians are often short-term or transitional resources.
- This creates ongoing issues in:
  - process consistency
  - customer education
  - technician training
  - service quality assurance
- The manufacturer’s service team carries additional burden in re-educating both customers and dealer technicians.

## 10. Repair and Inventory Status Are Managed Through Manual Signals

- Repaired items are tracked using color-coded stickers and physical tagging practices.
- While useful locally, these methods do not provide a consolidated, real-time operational view.
- This limits visibility into repair state, pending action, and reusable inventory.

## Key Business Risks

- Unknown end-customer base remains large
- Warranty start-date governance remains inconsistent
- Spare part movement is not tightly linked to actual complaint resolution
- Reverse logistics for defective parts is weak
- Service closure lacks dependable proof
- Dealer inventory held during warranty periods creates additional ambiguity
- Customer experience depends on incomplete and delayed information
- Installed-base management is fragmented

## Core Business Questions Emerging From the Current Flow

1. How can all main products and serviceable spare parts be identified and tracked consistently?
2. How can dealers and distributors reliably communicate who they sold to and when installation happened?
3. How can spare parts dispatched from the head office be tied to a specific customer, product, location, and complaint?
4. How can the company ensure spare replacements are genuine and supported by customer acknowledgement?
5. How can the organization maintain a current view of items issued, returned, pending, and unresolved across dealers and regional offices?
6. How can service activity, customer identity, warranty status, spare movement, and closure proof be brought into one connected process?
7. How can installation reporting be digitized so that first-hand customer and device information is complete and usable?
8. At what stage should the end-customer record be created and maintained so that future warranty and service activity becomes traceable?

## Conclusion

The prospect’s current operating model is workable but highly fragmented. Product dispatch, installation reporting, warranty activation, spare issuance, service coordination, and customer acknowledgement are all partially managed in separate ways. The central challenge is not only warranty management, but end-to-end post-sales traceability across the channel, the installed base, the service network, and spare replacement operations.
