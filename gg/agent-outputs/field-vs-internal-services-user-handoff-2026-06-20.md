# FeedbackNFC User Handoff: Field Service vs Internal Services

Date: 2026-06-20

## What Changed

The platform now runs two separate operator workspaces for the same manufacturing company:

- **Field Service**
  - customer tickets
  - technician jobs
  - dispatch
  - field repair and closure
- **Internal Services**
  - inward receipt
  - bench repair
  - QA
  - stock and disposition
  - sticker-led internal repair flow

Users should now sign in only with the account assigned to their workspace.

## Workspace Map

### Field Service

Use this workspace for:

- service-center dashboard
- ticket assignment
- technician execution
- customer-facing field work

Typical roles:

- Field Service Admin
- Field Dispatcher
- Field Technician

Default destinations:

- Field Service Admin -> `/dashboard/service-center-overview`
- Field Dispatcher -> `/dashboard/tickets`
- Field Technician -> `/dashboard/my-jobs`

### Internal Services

Use this workspace for:

- inward receipt
- label affix and scan-led intake
- bench repair
- QA
- stock release and disposition

Typical roles:

- Internal Services Super Admin
- Internal Services Admin
- Internal Inward Operator
- Internal Bench Engineer
- Internal QA Engineer
- Internal Stock Controller

Default destinations:

- Internal Services Super Admin -> `/dashboard/internal-services`
- Internal Services Admin -> `/dashboard/internal-services`
- Internal Inward Operator -> `/dashboard/internal-services/inward`
- Internal Bench Engineer -> `/dashboard/internal-services/bench`
- Internal QA Engineer -> `/dashboard/internal-services/qa`
- Internal Stock Controller -> `/dashboard/internal-services/stock`

### Label-Only Surface

Use this workspace for:

- sticker batch generation
- QR / Data Matrix / micro Data Matrix print sheets

Typical role:

- Internal Label Admin

Default destination:

- Internal Label Admin -> `/dashboard/manufacturer/stickers`

## Production Demo Accounts

Shared password:

- `Itrads@230999`

Field accounts:

- `ml+sc@feedbacknfc.com` -> Field Service Admin
- `ml+phase1-tech-accept@feedbacknfc.com` -> Field Technician

Manufacturer workspace:

- `ml+mfg@feedbacknfc.com` -> Manufacturer Workspace Admin

Internal Services accounts:

- `ml+internal-super@feedbacknfc.com` -> Internal Services Super Admin
- `ml+internal-admin@feedbacknfc.com` -> Internal Services Admin
- `ml+inward@feedbacknfc.com` -> Internal Inward Operator
- `ml+bench@feedbacknfc.com` -> Internal Bench Engineer
- `ml+qa@feedbacknfc.com` -> Internal QA Engineer
- `ml+stock@feedbacknfc.com` -> Internal Stock Controller
- `ml+labels@feedbacknfc.com` -> Internal Label Admin

## Admin Rules

- Create **Field Service Admin** accounts for ticket and technician operations only.
- Create **Internal Services** accounts for depot, bench, QA, stock, and label work only.
- Do not reuse one login across both flows.
- If a person genuinely works in both flows, issue separate accounts.

## First Login Guidance

- If the user lands in the wrong surface, they are using the wrong account.
- Sign out and switch to the account assigned to the intended workspace.
- Newly created Clerk users may receive a first-use email verification challenge depending on Clerk session policy.

## Operator Quick Check

Ask each user to confirm:

1. They land on the correct dashboard after sign-in.
2. They only see menu items for their own workflow.
3. They cannot open the other workspace by direct URL.
4. Their day-one task page is reachable without asking for admin help.

## Owner Summary

This separation is now active:

- one platform
- one manufacturing company
- two operator flows
- separate role-based dashboards
- separate route boundaries
- separate login personas
