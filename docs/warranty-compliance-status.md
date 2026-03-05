# WARRANTY Spec Compliance Status

**App:** `warranty.feedbacknfc.com`  
**As of:** 2026-03-05  
**Release baseline:** commit `1e6dc3d`  
**Reference spec:** `warranty-dev-spec.md`

---

## Summary

- **Completed:** GAP 1, 2, 3 (MVP), 4, 5, 6 (MVP), 7, 8 (MVP), 9, 10, 11 (MVP), 12

---

## Gap-by-gap status

| GAP | Priority | Status | Scope | Primary Evidence |
|---|---|---|---|---|
| 1 — Bulk allocation serial binding | P0 | ✅ Implemented | Full | `/dashboard/manufacturer/stickers`, `POST /api/manufacturer/allocate` |
| 2 — Notification system (SMS + Email) | P0 | ✅ Implemented | Core flow | `src/lib/notifications.ts`, `src/lib/notification-triggers.ts`, `src/lib/warranty-notifications.ts` |
| 3 — AI technician assignment scoring | P1 | ✅ Implemented | MVP | Skill + availability filtering, workload-aware assignment fallback |
| 4 — Customer portal dashboard | P1 | ✅ Implemented | Full (MVP target) | `/dashboard/customer`, customer navigation redirect |
| 5 — Warranty certificate PDF | P1 | ✅ Implemented | Full (MVP target) | `GET /api/products/{id}/certificate`, certificate actions in customer flows |
| 6 — Multi-language support (i18n) | P1 | ✅ Implemented | MVP (EN + HI for customer NFC) | `src/lib/nfc-i18n.ts`, `/nfc/{id}?lang=en|hi` |
| 7 — SLA tracking + auto-escalation | P2 | ✅ Implemented | Batch 4 | SLA defaults, 30-min sweep, escalation + notifications |
| 8 — Claim documentation completeness | P1 | ✅ Implemented | MVP | Auto-compilation + claim report PDF |
| 9 — Settings pages completeness | P2 | ✅ Implemented | Batch 4 | Manufacturer/service-center settings fields expanded |
| 10 — Service center claim review-and-submit | P1 | ✅ Implemented | Full (MVP target) | `/dashboard/claims/{claimId}`, `POST /api/claim/{id}/submit` |
| 11 — Sticker route technician tap experience | P1 | ✅ Implemented | MVP | Technician start/complete flows on `/nfc/{id}` |
| 12 — Report issue form complete fields | P1 | ✅ Implemented | Full (MVP target) | Customer issue form includes category/severity/photos/phone |

---

## Batch 3 specific validation (GAP 4 + GAP 6)

### GAP 4 — Customer Dashboard

Implemented:

- Route: `/dashboard/customer`
- Customer dashboard sections:
  - My Products
  - My Tickets
  - Support
  - Register Another Product
- Customer role landing:
  - `/dashboard` redirects customer role to `/dashboard/customer`

Implementation references:

- `src/app/(dashboard)/dashboard/customer/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/lib/roles.ts`
- `src/app/api/sticker/[number]/qr/route.ts`

### GAP 6 — Multi-language i18n (MVP)

Implemented:

- Customer NFC pages localized in English/Hindi:
  - Warranty activation
  - Product view
  - Ticket tracker
  - Resolution confirmation
- Language selection:
  - URL query (`?lang=en` / `?lang=hi`)
  - customer language preference fallback
  - browser language fallback
- SMS localization:
  - Customer-facing SMS templates honor `users.language_preference` (`hi`/fallback `en`)

Implementation references:

- `src/lib/nfc-i18n.ts`
- `src/components/nfc/language-toggle.tsx`
- `src/app/nfc/[id]/page.tsx`
- `src/components/nfc/warranty-activation.tsx`
- `src/components/nfc/customer-product-view.tsx`
- `src/components/nfc/customer-ticket-tracker.tsx`
- `src/components/nfc/customer-confirm-resolution.tsx`
- `src/lib/notification-triggers.ts`
- `src/lib/warranty-notifications.ts`
- `src/app/api/warranty/activate/route.ts`
- `src/app/api/ticket/[id]/enroute/route.ts`
- `src/app/api/ticket/[id]/start/route.ts`
- `src/app/api/ticket/[id]/complete/route.ts`
- `src/app/api/warranty/expiry/sweep/route.ts`

---

## Batch 4 specific validation (GAP 7 + GAP 9)

### GAP 7 — SLA tracking and auto-escalation

Implemented:

- SLA defaults aligned with spec:
  - low: response 48h / resolution 72h
  - medium: response 24h / resolution 48h
  - high: response 8h / resolution 24h
  - critical: response 2h / resolution 8h
- Ticket creation stores SLA deadlines from severity + manufacturer settings.
- SLA sweep endpoint supports auto-escalation and breach notifications.
- Cron cadence:
  - production Hobby deployment: daily sweep
  - ready for Pro upgrade to every 30 minutes (`*/30 * * * *`)
- Service-center and manufacturer ticket queues show SLA indicator states:
  - on track
  - at risk
  - breached

Implementation references:

- `src/lib/sla-config.ts`
- `src/lib/sla-engine.ts`
- `src/app/api/ticket/create/route.ts`
- `src/app/api/ticket/sla/sweep/route.ts`
- `src/app/(dashboard)/dashboard/tickets/page.tsx`
- `src/app/(dashboard)/dashboard/manufacturer/tickets/page.tsx`
- `vercel.json`

### GAP 9 — Settings pages content

Implemented:

- Manufacturer settings include:
  - organization profile (including logo URL, GST, contacts)
  - SLA configuration
  - notification channel preferences
  - notification event toggles
  - API key/integration placeholder metadata
  - team members management (link Clerk users, activate/deactivate)
- Service-center settings include:
  - organization profile
  - notification preferences
  - per-center service radius and supported categories
  - per-center operating hours (weekday schedule)

Implementation references:

- `src/app/(dashboard)/dashboard/manufacturer/settings/page.tsx`
- `src/components/manufacturer/settings-client.tsx`
- `src/app/api/manufacturer/settings/route.ts`
- `src/app/api/manufacturer/team-members/route.ts`
- `src/app/api/manufacturer/team-members/[id]/route.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/components/service-center/settings-client.tsx`
- `src/app/api/service-center/settings/route.ts`

---

## Deferred scope notes

- GAP 6 full `next-intl` rollout (all dashboard roles + 6 languages) remains future scope; MVP currently covers customer NFC pages in EN/HI.
- GAP 3 full weighted GPS scoring can be extended in a later phase; current logic satisfies MVP prioritization requirements.
