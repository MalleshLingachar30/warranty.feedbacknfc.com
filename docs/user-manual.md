# FeedbackNFC Warranty Platform — User Manual

**App:** `warranty.feedbacknfc.com`  
**Last updated:** 2026-03-05  
**Scope:** Manufacturer Admin, Service Center Admin, Technician, Customer  
**Current release snapshot:** Batch 1 + Batch 2 + Batch 3 on production

> This is a living document. Some screens/metrics may change as features ship.

Release reference:

- Git commit: `3cb6a78`
- Production URL: `https://warranty.feedbacknfc.com`

---

## Table of contents

1. Overview (roles + objects)
2. Validated end-to-end workflow
3. Ticket + claim lifecycle (what happens when)
4. Setup (Clerk users + platform roles)
5. Manufacturer Admin guide
6. Service Center Admin guide
7. Technician guide (mobile-first)
8. Customer guide (NFC/QR tap flow)
9. Analytics & KPIs (how it’s calculated)
10. Manual QA flow (using test sticker `100`)
11. GAP compliance update (Batch 1 + Batch 2 + Batch 3)
12. Troubleshooting

---

## 1) Overview (roles + objects)

### Roles

- **Manufacturer Admin**
  - Owns product catalog (models), sticker allocations, and reimbursement decisions (claims).
  - Views cross-service-center performance and analytics.
- **Service Center Admin**
  - Operates service delivery for a service center organization.
  - Onboards technicians, monitors tickets (service queue), and tracks claims outcomes.
- **Technician**
  - Receives assigned jobs, updates job status (enroute → start → complete), uploads proof, and closes the service work.
- **Customer**
  - Scans/taps the sticker to activate warranty, raise service requests, track status, and confirm resolution.

### Core objects

- **Sticker** — physical NFC/QR sticker mapped to a number: `/nfc/{stickerNumber}`  
- **Product Model** — manufacturer’s SKU / model catalog (warranty duration, common issues, required skills)  
- **Product (Unit)** — a specific product unit bound to a sticker (serial number, installation date, customer details)  
- **Ticket** — service request raised by customer; moves through workflow states  
- **Claim** — reimbursement record generated for warranty work (auto-generated after customer confirmation)

---

## 2) Validated end-to-end workflow (how the system works)

Your summary is correct with two important clarifications:

1) **Technicians are managed by Service Center Admins** (not by manufacturers).  
   Manufacturer Admins can **view** technicians per service center (read-only) via Service Network.

2) **Claims are auto-generated after customer confirmation**, not immediately at technician completion.  
   Technician completion puts the ticket into **`pending_confirmation`**; customer confirmation triggers claim creation.

### End-to-end flow (validated)

1. **Manufacturer Admin**
   - Creates **Product Models**.
   - Allocates **Sticker ranges** to product models and binds stickers to product units.
   - Authorizes **Service Centers** in the service network.
2. **Customer**
   - First scan/tap on a bound product triggers **Warranty Activation**.
   - Later scans show product details, ticket tracker, and confirmation actions.
3. **Customer creates a service request**
   - Customer reports an issue on the sticker page.
   - System creates a **Ticket** and runs **AI assignment** (skill + location matching).
4. **Service Center Admin + Technician execution**
   - Ticket appears in the service center queue.
   - Assigned technician sees it in **My Jobs**.
   - Technician updates status (accept/enroute → start work → complete work).
5. **Customer confirmation**
   - After technician marks the job complete, ticket becomes **pending confirmation**.
   - Customer scans/taps again (or uses a shared link) to **Confirm Resolution**.
6. **Claim generation + manufacturer review**
   - System auto-generates a warranty claim after customer confirmation.
   - Manufacturer reviews: approve/reject (and later mark paid/closed as needed).
7. **Analytics**
   - Analytics pages summarize tickets, claims, resolution times, ratings, and product performance.

---

## 3) Ticket + claim lifecycle (what happens when)

### Ticket states (simplified)

- `reported` → customer created a service request
- `assigned` → system assigned a service center + technician
- `technician_enroute` → technician accepted job and is travelling
- `work_in_progress` → technician started work
- `pending_confirmation` → technician completed work; customer must confirm
- `resolved` → customer confirmed resolution (claim can be generated)
- `closed` → final/archived state (optional; depends on ops policy)
- `escalated` / `reopened` → requires intervention (no in-app manual assignment UI yet)

### Claim states (simplified)

- `auto_generated` → created by system after customer confirmation (internal service-center draft stage)
- `submitted` → service center reviewed and submitted to manufacturer
- `under_review` / `approved` / `rejected` → manufacturer decision
- `paid` / `closed` → settlement bookkeeping

---

## 4) Setup (Clerk users + platform roles)

The platform uses **Clerk** for authentication, and a **Neon Postgres + Prisma** DB to store role + organization context.

### A) Create the user in Clerk first

In the Clerk dashboard:

1. Create the user (or invite them).
2. Copy their **Clerk User ID** (format: `user_...`).

![Create Clerk user](./assets/clerk-create-user.png)

Example list of created users:

![Clerk users list](./assets/clerk-users-list.png)

### B) Ensure the app has a DB `users` row

The app creates/updates a DB user row automatically on sign-in for most users.

For technicians, we explicitly create/update the DB row via the **Service Center → Add Technician** flow (below).

Example `User` table record (DB):

![DB user table](./assets/db-user-table.png)

### C) Service Center Admin: onboard technicians (recommended path)

1. Sign in as **Service Center Admin**
2. Go to `Dashboard → Technicians`
3. Click **Add Technician**
4. Paste the Clerk User ID (`user_...`)
5. Fill: name, phone, skills, max concurrent jobs
6. Pick the service center
7. Save

This creates:

- `users` row (role = `technician`, organization_id = service center org)
- `technicians` row (skills, availability, service_center_id)

---

## 5) Manufacturer Admin guide

### Navigation

After sign-in, Manufacturer Admins are redirected to:

- `Dashboard → /dashboard/manufacturer`

Key sections:

- **Products** (`/dashboard/manufacturer/products`)  
  Create/edit product models (model number, warranty months, common issues, required skills).
- **Stickers** (`/dashboard/manufacturer/stickers`)  
  Allocate sticker ranges to models (inventory + allocation history).
- **Tickets** (`/dashboard/manufacturer/tickets`)  
  Monitor service execution across all products for your org.
- **Service Network** (`/dashboard/manufacturer/service-network`)  
  Authorize service centers and view their technician roster + performance metrics.
- **Claims** (`/dashboard/manufacturer/claims`)  
  Review submitted claims and approve/reject amounts.
- **Analytics** (`/dashboard/manufacturer/analytics`)  
  Product performance + cost trends (derived from tickets/claims).
- **Settings** (`/dashboard/manufacturer/settings`)

### Common manufacturer tasks (step-by-step)

1. **Create Product Models**
   - Go to `Products` → `Add Product Model`
   - Fill required fields (Name, Category, Model Number, Warranty Duration)
2. **Allocate Stickers**
   - Go to `Stickers`
   - Allocate a sticker range to a product model
3. **Authorize Service Centers**
   - Go to `Service Network`
   - Click `Authorize New Center`
4. **Review Claims**
   - Go to `Claims`
   - Open a claim → review documentation → approve/reject

### Sticker allocation wizard (GAP 1 compliant)

The bulk allocation wizard at `/dashboard/manufacturer/stickers` follows the required 5-step flow:

1. **Sticker Range** — enter start and end sticker numbers
2. **Product Model** — select model from catalog
3. **Serial Range** — enter appliance serial prefix/start/end
4. **Review** — preview mapping table (first 5 + last 5) and summary
5. **Success/Confirm** — execute allocation

On confirm, backend performs one-to-one binding:

- Creates/updates one `products` row per sticker in range
- Sets `stickers.status = bound`
- Sets `products.warranty_status = pending_activation`
- Stores allocation in `sticker_allocations` with:
  - `appliance_serial_prefix`
  - `appliance_serial_start`
  - `appliance_serial_end`

---

## 6) Service Center Admin guide

### Navigation

Service center admins use:

- `Tickets` (`/dashboard/tickets`) — live queue + SLA indicators
- `Technicians` (`/dashboard/technicians`) — roster + availability
- `Claims` (`/dashboard/claims`) — pipeline and outcomes
- `Settings` (`/dashboard/settings`)

### Add technicians (where you onboard more technicians)

Use the **Technicians** page:

![Service Center → Technicians page](./assets/service-center-technicians.png)

Steps:

1. Create the technician in **Clerk** (or invite).
2. Copy the Clerk user id (`user_...`).
3. `Dashboard → Technicians → Add Technician`.
4. Save.

### Service-center claim review & submit (new flow)

Claims now follow this path:

- `auto_generated` (system-generated after customer confirmation)
- Service-center **Review & Submit**
- Manufacturer review (`approved` / `rejected`)

Where to do it:

1. Open `Dashboard → Claims`
2. For `auto_generated` claims, click **Review & Submit**
3. This opens `Dashboard → Claims → /dashboard/claims/{claimId}`
4. Review/update:
   - Review notes
   - Labor hours
   - Parts list (name, part number, unit cost, quantity)
5. Click **Review & Submit to Manufacturer**

After submission:

- Claim status becomes `submitted`
- Manufacturer receives notification
- Claim PDF can be opened from service-center claims table (`PDF` action)

### Tickets (what you should monitor)

In `Tickets`, watch:

- **Open Tickets** — requires dispatch + monitoring
- **Pending Confirmation** — technician completed; waiting on customer confirmation
- **Escalated/Reopened** — needs intervention (manual escalation workflow is still evolving)

---

## 7) Technician guide (mobile-first)

Technicians work from the dashboard + sticker tap flow.

### Technician dashboard pages

- **My Jobs** (`/dashboard/my-jobs`)
  - Assigned tab: new jobs to accept
  - In Progress tab: active work
  - Completed tab: history
- **Schedule** (`/dashboard/schedule`) — daily/weekly schedule view
- **My Performance** (`/dashboard/my-performance`) — jobs completed, avg resolution time, rating, claims value generated

### On a job (expected technician flow)

1. Open `My Jobs`
2. Tap a job → `Accept & Start Navigation`
3. When on-site → `Start Work`
4. After repair → `Complete Work`
   - Add resolution notes (required)
   - Add parts used (if any)
   - Upload before/after photos (optional)
5. Ticket becomes **Pending Confirmation**

### Sticker tap flow for technicians (`/nfc/{stickerNumber}`)

When a technician scans the sticker while signed in:

- `assigned` / `technician_enroute` → shows **Technician Work Start**
- `work_in_progress` → shows **Technician Completion** form with:
  - resolution notes
  - labor hours
  - before photos (camera upload)
  - after photos (camera upload)
  - parts used (from model parts catalog)
- `pending_confirmation` and later → shows summary + customer confirmation guidance

### When customer confirmation is pending (what to do)

If you see **Pending Confirmation**, the customer still needs to confirm.

The NFC sticker page gives a technician a “Waiting for customer confirmation” callout and a customer link to share.

Example pending confirmation summary:

![Technician ticket summary pending confirmation](./assets/technician-ticket-summary-pending-confirmation.png)

Recommended: copy/share the customer link so they can confirm immediately.

---

## 8) Customer guide (NFC / QR tap flow)

Customers do not need to sign in to start:

- Sticker route: `https://warranty.feedbacknfc.com/nfc/{stickerNumber}`

### Customer dashboard (`/dashboard/customer`)

Signed-in customers now have a dedicated dashboard:

- **My Products** summary cards with:
  - warranty status
  - open-ticket snippet
  - QR quick-open for each sticker
  - warranty certificate download
- **My Tickets** summary with open/closed counts + quick links
- **Support** quick links
- **Register Another Product** entry card

Dashboard data binding logic:

- Products are linked by `customerId`, verified phone, or verified email
- Tickets are linked by `reportedByUserId`, product ownership, and verified contact channels
- This allows a customer to see historical records even if old tickets were created before full account linking

### Customer actions by state

1. **Pending activation**
   - First scan/tap → fills activation info → warranty becomes active
2. **Active + no open ticket**
   - Customer sees product details + can create a service request
   - Customer can download **Warranty Certificate PDF**
3. **Open ticket exists**
   - Customer sees tracker (status timeline + technician details)
4. **Pending confirmation**
   - Customer sees **Confirm Resolution**
   - Confirming resolution triggers automatic claim generation

### Customer language support (MVP: English + Hindi)

On customer-facing sticker pages (`/nfc/{id}`):

- Language toggle is available in the page header (`English` / `हिंदी`)
- Language can be forced via URL query:
  - `/nfc/100?lang=en`
  - `/nfc/100?lang=hi`
- If query is not set, language is selected from:
  1. customer `language_preference` (if known)
  2. browser `Accept-Language`
  3. default English
- Localized customer surfaces include:
  - activation form
  - product view
  - ticket tracker
  - resolution confirmation page

Notification language behavior:

- Customer SMS templates use `users.language_preference`
- Current supported SMS languages: `en` and `hi`
- Unsupported language values currently fall back to English

### Warranty certificate PDF

Certificate endpoint:

- `GET /api/products/{productId}/certificate?download=1`

Certificate includes:

- product/model/serial details
- manufacturer name/logo
- customer name
- warranty start/end dates
- certificate reference number
- QR that resolves to `/nfc/{stickerNumber}`

---

## 9) Analytics & KPIs (how it’s calculated)

Analytics is derived from:

- tickets (status transitions, timestamps)
- technician performance (completion counts, average resolution durations)
- claims (amounts + outcomes)
- product models (issue categories, volumes)

Examples of KPIs:

- Average assignment latency (Reported → Assigned)
- Average resolution time (Work started → Work completed)
- Pending claims amount (auto_generated/submitted/under_review)
- Top issues by model (issueCategory frequency)

---

## 10) Manual QA flow (using test sticker `100`)

Use this sticker URL as a test card:

- `https://warranty.feedbacknfc.com/nfc/100`

> If you must use `https://feedbacknfc.com/nfc/100`, ensure the root-domain router redirects warranty stickers to `warranty.feedbacknfc.com`. That redirect may be managed outside this repository.

### Recommended QA checklist

1. **Customer activation**
   - Open `/nfc/100` in an incognito window
   - If pending activation: submit activation form
2. **Create service request**
   - Report issue with a description
   - Verify ticket status becomes `reported` then `assigned`
3. **Service Center Admin checks queue**
   - Sign in as service center admin
   - Open `Dashboard → Tickets` and confirm ticket appears
4. **Technician executes job**
   - Sign in as technician
   - `My Jobs` → accept → start → complete with notes
   - Verify status becomes `pending_confirmation`
5. **Customer confirms**
   - Back on `/nfc/100` (as customer/anonymous)
   - Confirm resolution
   - Verify claim is auto-generated
6. **Claims**
   - Service center: `Dashboard → Claims` shows new `auto_generated` claim
   - Service center: open **Review & Submit**, finalize notes/parts/labor, submit
   - Manufacturer: `Dashboard → Claims` sees `submitted` claims and can approve/reject
   - Verify claim PDF downloads from both service-center/manufacturer views
7. **Notification checks (GAP 2)**
   - Verify customer receives SMS on activation
   - Verify technician receives SMS on ticket assignment
   - Verify service center receives email on ticket assignment
   - Verify customer receives SMS for enroute / started / completed
   - Verify completed SMS contains direct link to `/nfc/100`
   - Verify technician receives SMS when customer confirms
   - Verify manufacturer gets email when claim is created
8. **Warranty certificate checks**
   - After activation, verify **Download Warranty Certificate** button is visible
   - Open certificate PDF and verify product/customer/warranty fields + QR
   - Verify service center gets email+SMS on claim approve/reject
9. **Customer dashboard checks (GAP 4)**
   - Sign in as customer and open `/dashboard/customer`
   - Verify products list, ticket summary, support links, and register-product card
   - Verify product card QR opens the same sticker route
10. **Language checks (GAP 6 MVP)**
   - Open `/nfc/100?lang=hi` and verify Hindi labels on customer pages
   - Switch back to English using header toggle
   - Set customer language preference to Hindi in customer settings
   - Trigger customer SMS events (activation / enroute / started / completed) and verify Hindi template
11. **Dashboard checks (data matching edge cases)**
   - Activate product with phone only, then sign in with matching verified phone
   - Confirm product appears in `/dashboard/customer`
   - Create ticket anonymously from `/nfc/100` and confirm it appears in customer dashboard after sign-in

If you’re using the E2E seeding script locally, you may see output like:

![Seed E2E output](./assets/seed-e2e-output.png)

---

## 11) GAP compliance update (Batch 1 + Batch 2 + Batch 3)

Detailed tracker document:

- `docs/warranty-compliance-status.md`

### Batch 1 (already implemented)

#### GAP 1: Bulk allocation serial binding

Status: **Implemented**

- Wizard flow + mapping preview: `/dashboard/manufacturer/stickers`
- Backend binding: `POST /api/manufacturer/allocate`
- Persists serial range fields in `sticker_allocations`

#### GAP 2: Notifications (SMS + Email + trigger layer)

Status: **Implemented (core flow)**

- Transport layer: `src/lib/notifications.ts`
- Trigger layer: `src/lib/notification-triggers.ts`
- Wrapper: `src/lib/warranty-notifications.ts`

### Batch 2 (implemented in current release)

#### GAP 3: AI assignment scoring improvements

Status: **Implemented (MVP scope)**

- Enforces skill matching before assignment
- Keeps availability/capacity filtering
- Uses workload-first fallback sorting when customer pincode is unavailable
- Notifies service center for manual assignment when no match

#### GAP 12: Report issue form completeness

Status: **Implemented**

Customer `/nfc/{id}` report form includes:

- issue category (from model common issues)
- issue description
- severity selector
- photo upload (`accept="image/*" capture="environment"`)
- customer phone (prefilled when known)
- fallback category (`General issue`) if model has no configured issues

#### GAP 5: Warranty certificate PDF

Status: **Implemented**

- API: `GET /api/products/{id}/certificate`
- UI buttons:
  - activation success view
  - active customer product view
- Activation notification now includes certificate link when available

#### GAP 8: Claim documentation completeness + claim PDF

Status: **Implemented (MVP scope)**

On customer confirmation, claim auto-generation now captures:

- product details, customer details, issue metadata
- technician details and resolution notes
- before/after/issue photos
- parts (detailed lines), labor, computed totals
- timeline events + workflow timestamps
- location object when present

Claim report PDF:

- API: `GET /api/claim/{id}/report`
- Link surfaced in service-center and manufacturer claim views

#### GAP 10: Service-center review-and-submit step

Status: **Implemented**

- Service-center claims table now has **Review & Submit** for `auto_generated`
- Review page: `/dashboard/claims/{claimId}`
- Submit API: `POST /api/claim/{id}/submit`
- Manufacturer queue now targets submitted+ claims (not raw auto-generated drafts)

#### GAP 11: Technician sticker tap experience

Status: **Implemented (MVP scope)**

Technician branch on `/nfc/{id}` now supports:

- start flow for `assigned` / `technician_enroute`
- completion flow for `work_in_progress` with notes, photos, parts, labor
- summary + customer confirmation guidance for later stages
- read-only asset view when technician is not assigned

### Batch 3 (implemented in current release)

#### GAP 4: Customer portal dashboard

Status: **Implemented**

- Route: `/dashboard/customer`
- Includes:
  - My Products summary
  - My Tickets summary
  - Support quick links
  - Register Another Product card
- Customer role navigation now links directly to `/dashboard/customer`

#### GAP 6: Multi-language support (MVP scope)

Status: **Implemented (MVP scope)**

- Customer-facing sticker pages now support English + Hindi
- Added header language toggle on `/nfc/{id}`
- Added language detection via query + user preference + browser header
- Customer SMS templates now respect `users.language_preference` (`hi` → Hindi, fallback English)

### Notification events currently wired

- Warranty activated → customer SMS (+ certificate link when available, language-aware)
- Ticket created → technician SMS + service center email
- Technician en route → customer SMS (includes ETA, language-aware)
- Work started → customer SMS (language-aware)
- Work completed → customer SMS with direct confirmation link (`/nfc/[stickerNumber]`, language-aware)
- Customer confirmed → technician SMS
- Claim submitted → manufacturer email
- Claim approved → service center email + SMS
- Claim rejected → service center email + SMS
- SLA breach → service center + manufacturer email
- Warranty expiring reminder (30-day window) → customer SMS (daily sweep, language-aware)

### Cron routes and schedules (current production configuration)

Cron endpoints:

- `/api/ticket/sla/sweep`
- `/api/warranty/expiry/sweep`

Current `vercel.json` schedules:

- SLA sweep: daily at `00:30` UTC
- Warranty expiry sweep: daily at `09:00` UTC

Note:

- Vercel Hobby plan does not allow high-frequency cron (for example, every 30 minutes).
- With Vercel Pro, SLA sweep can be changed to `*/30 * * * *`.

### Required environment variables (notifications)

Twilio:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (or `TWILIO_FROM_NUMBER`)
- `TWILIO_WHATSAPP_NUMBER` (optional)

Resend:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

App URL and cron keys:

- `NEXT_PUBLIC_WARRANTY_APP_URL` (optional override for confirmation link base URL)
- `SLA_CRON_KEY` (optional if not using Vercel Cron header auth)
- `WARRANTY_EXPIRY_CRON_KEY` (optional if not using Vercel Cron header auth)

---

## 12) Troubleshooting

### “Sign-in is temporarily unavailable”

This usually indicates Clerk could not load or the environment keys/domain settings are wrong.

![Clerk sign-in temporarily unavailable](./assets/sign-in-temporarily-unavailable.png)

Checks:

- Confirm production uses correct Clerk instance/keys
- Confirm Clerk app allows your domain (`warranty.feedbacknfc.com`)
- Confirm Vercel env vars are set for the production deployment
- Confirm `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` belong to the same Clerk instance

### Sign-in title shows something unexpected (e.g., “Gift Admin”)

The sign-in UI title comes from Clerk “Application name / appearance” settings.

![Unexpected sign-in title](./assets/sign-in-gift-admin.png)

If you see “Couldn’t find your account”, the user likely does not exist in the current Clerk instance:

![User not found on Clerk sign-in](./assets/sign-in-gift-admin-not-found.png)

Fix:

- Ensure you created the user in the same Clerk application/environment (dev vs prod)
- Ensure you’re on the correct domain pointing to the intended Clerk keys

### Customer dashboard is empty after sign-in

Checks:

- Confirm customer has verified email/phone in Clerk
- Confirm product/ticket records contain matching phone/email or customerId
- Open `Dashboard → Settings` and confirm profile data matches expected activation data

---

## Appendix: Screenshot checklist (recommended additions)

If you want a “complete” manual PDF/handbook, capture and add screenshots for these pages:

- Manufacturer Admin
  - `/dashboard/manufacturer` (overview)
  - `/dashboard/manufacturer/products` (product models list + add/edit dialog)
  - `/dashboard/manufacturer/stickers` (allocation wizard + allocation history)
  - `/dashboard/manufacturer/service-network` (authorized centers + expanded details)
  - `/dashboard/manufacturer/claims` (claim review drawer)
  - `/dashboard/manufacturer/analytics`
- Service Center Admin
  - `/dashboard/tickets` (service queue)
  - `/dashboard/technicians` (with “Add Technician” dialog open)
  - `/dashboard/claims`
  - `/dashboard/claims/{claimId}` (review & submit form)
- Technician
  - `/dashboard/my-jobs` (assigned tab + job detail sheet)
  - `/dashboard/schedule`
  - `/dashboard/my-performance`
  - `/nfc/100` as technician at each stage (assigned / in-progress / pending confirmation)
- Customer
  - `/dashboard/customer` (overview with My Products/My Tickets/Support)
  - `/nfc/100` pending activation (activation form)
  - `/nfc/100?lang=hi` (Hindi language toggle state)
  - `/nfc/100` active product view (no open ticket)
  - `/nfc/100` active product view with certificate button
  - `/nfc/100` ticket tracker (open ticket)
  - `/nfc/100` confirm resolution screen
  - Certificate PDF opened from `/api/products/{id}/certificate`

Tip: keep screenshots to ~1200–1600px width and crop out browser bookmarks for a cleaner manual.
