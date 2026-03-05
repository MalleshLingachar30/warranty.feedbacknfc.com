# Batch 4 UAT Checklist (GAP 7 + GAP 9)

**Scope:** SLA breach simulation + settings verification  
**Environment:** `https://warranty.feedbacknfc.com`  
**Primary test sticker:** `https://warranty.feedbacknfc.com/nfc/100`  
**Date:** 2026-03-05

---

## 1) Preconditions

- Test users are available for:
  - manufacturer admin
  - service center admin
  - technician
  - customer
- Access to Neon DB console (tables: `tickets`, `ticket_timeline`, `organizations`, `service_centers`, `users`)
- Access to `SLA_CRON_KEY` value for manual SLA sweep trigger

---

## 2) SLA UAT flow (GAP 7)

### Step A — Create a new ticket

1. Open `https://warranty.feedbacknfc.com/nfc/100` as customer.
2. Create a new service request.
3. Capture `ticket.id` and `ticket_number` from DB.

### Step B — Validate SLA badge states in UI

Run DB updates on the same ticket and verify both pages:

- Manufacturer: `/dashboard/manufacturer/tickets`
- Service center: `/dashboard/tickets`

#### B1) On track

Set:

- `sla_resolution_deadline = now() + interval '24 hours'`
- `sla_breached = false`

Expected:

- SLA badge shows **On track**

#### B2) At risk

Set:

- `sla_resolution_deadline = now() + interval '30 minutes'`
- `sla_breached = false`

Expected:

- SLA badge shows **At risk**

#### B3) Breached after sweep

Set:

- `sla_resolution_deadline = now() - interval '2 hours'`
- `sla_breached = false`
- `escalation_level = 0`
- `escalated_at = null`

Trigger sweep for one ticket:

```bash
curl -X POST \
  "https://warranty.feedbacknfc.com/api/ticket/sla/sweep?ticketId=<TICKET_ID>" \
  -H "x-sla-cron-key: <SLA_CRON_KEY>"
```

Expected DB updates:

- `tickets.sla_breached = true`
- `tickets.status = 'escalated'` (for active tracked statuses)
- `tickets.escalation_level = 1`
- `tickets.escalated_at` set
- `tickets.escalation_reason` populated
- one new `ticket_timeline` row with `event_type = 'sla_breached'`

Expected UI:

- SLA badge shows **Breached**

### Step C — Verify SLA breach notification toggle behavior

1. Disable **Notify On SLA Breach** in:
   - manufacturer settings and/or
   - service-center settings
2. Repeat Step B3 on another ticket.

Expected:

- Ticket still escalates and timeline entry is created.
- Breach email is sent only for organizations that keep SLA-breach notifications enabled.

---

## 3) Settings UAT flow (GAP 9)

### A) Manufacturer settings (`/dashboard/manufacturer/settings`)

Verify each save persists after page reload:

- Organization profile:
  - name, logo URL, GST, contacts, address
- SLA configuration:
  - response/resolution hours per severity
- Notification channels:
  - SMS, Email, WhatsApp, SLA breach, weekly digest
- Notification events:
  - warranty activation, ticket created, technician updates, claims, warranty expiry, SLA breach
- Integration placeholders:
  - ERP webhook URL
  - API key label
  - masked key value
- Team members:
  - add by Clerk ID
  - activate/deactivate existing member

### B) Service-center settings (`/dashboard/settings`)

Verify each save persists after reload:

- Organization profile
- Notification preferences
- Per-center controls:
  - service radius
  - supported categories
  - operating hours (Mon–Sun)
  - active/inactive toggle

---

## 4) SLA policy persistence check

1. In manufacturer settings, set critical SLA to known values (example: response `2`, resolution `8`).
2. Create a new **critical** ticket.
3. Confirm deadlines in `tickets` match `reported_at + configured hours`.

---

## 5) Exit criteria

Batch 4 is UAT-pass when all are true:

- SLA badge transitions are correct (`On track` → `At risk` → `Breached`).
- SLA sweep escalates overdue tickets and writes timeline events.
- SLA breach notification respects settings toggle.
- Manufacturer settings persist all newly added fields.
- Service-center settings persist radius/categories/operating-hours and active flags.
