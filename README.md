# warranty.feedbacknfc.com
Landing page to manage equipment warranty by resellers and manufacturers 

## Documentation

Core docs:

- `docs/user-manual.md` — end-to-end role-based operating manual (manufacturer, service center, technician, customer), QA flow, and GAP compliance status (Batch 1 + Batch 2 + Batch 3).
- `docs/clerk-auth-flow.md` — Clerk auth setup and role-testing flow.

## Key implemented batches (as of 2026-03-05)

- Batch 1: GAP 1 + GAP 2
  - Bulk sticker allocation with serial binding
  - Notification trigger system (SMS/email) with cron sweeps
- Batch 2: GAP 3 + GAP 12, GAP 5 + GAP 8, GAP 10 + GAP 11
  - AI assignment hardening + complete customer issue form
  - Warranty certificate PDF + claim documentation/report PDF
  - Service-center claim review/submit + technician sticker completion flow
- Batch 3: GAP 4 + GAP 6
  - Dedicated customer dashboard at `/dashboard/customer`
  - NFC customer flow localization (English/Hindi) + language-aware customer SMS templates
