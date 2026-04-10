# Technician Live Status / Location Implementation Plan

## State of Current System

- The customer-facing NFC flow already has the correct ownership gate for sensitive ticket data. [`src/app/nfc/[id]/page.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/nfc/[id]/page.tsx) only shows the full ticket tracker after Clerk phone-match or OTP owner-session verification via [`src/lib/otp-session.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/otp-session.ts).
- Ticket lifecycle is already explicit and useful for live tracking. The current states are `reported -> assigned -> technician_enroute -> work_in_progress -> pending_confirmation -> resolved/closed`, with `reopened` and `escalated` side paths in [`prisma/schema.prisma`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma).
- Technician actions already flow through dedicated endpoints:
  - [`src/app/api/ticket/[id]/enroute/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/enroute/route.ts)
  - [`src/app/api/ticket/[id]/start/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/start/route.ts)
  - [`src/app/api/ticket/[id]/complete/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/complete/route.ts)
  - [`src/app/api/ticket/[id]/confirm/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/confirm/route.ts)
- Customer tracking UI exists, but it is static server-rendered ticket state plus a single `etaLabel` read from ticket metadata. [`src/components/nfc/customer-ticket-tracker.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/customer-ticket-tracker.tsx) shows assigned technician name/phone and timeline, but there is no live refresh path and no customer-visible distance/freshness model.
- Technician mobile workflow already exists in two places:
  - dashboard job execution in [`src/components/technician/my-jobs-board.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/my-jobs-board.tsx) and [`src/components/technician/job-detail.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/job-detail.tsx)
  - sticker-scan execution in [`src/components/nfc/staff-sticker-views.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/staff-sticker-views.tsx)
- The technician experience is already mobile/PWA-oriented. Jobs poll every 60 seconds, offline photo queuing exists, and the app registers a service worker in [`src/components/pwa/pwa-runtime.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/pwa/pwa-runtime.tsx). That is the right surface for best-effort foreground location sharing.
- There is no realtime transport in the repo today. No websocket, SSE, or push channel is used for ticket updates. The only recurring refresh pattern is client polling.
- There is also no map or routing provider in the codebase today. The repo only uses Google Maps deep links for technicians to open the customer address, via [`src/components/technician/utils.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/utils.ts).
- The schema has dormant geo fields, but they are not usable as-is for this MVP:
  - `Technician.currentLocation Unsupported("point")?`
  - `ServiceCenter.location Unsupported("point")?`
  - `Product.installationLocation Json?`
  These fields are either unused or unsupported by normal Prisma reads/writes in the current app. Reusing `currentLocation` directly would force raw SQL into the main happy path.
- Assignment logic is still coarse. [`src/lib/ai-assignment.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/ai-assignment.ts) ranks technicians by pincode/service-radius heuristics, not by live device position.
- Important lifecycle gap: the current ticket model has no `paused` or `cancelled` status. The approved product behavior mentions stopping tracking on pause/cancel, so the MVP needs a stop helper that covers current end-states now and cleanly extends to future pause/cancel routes later.

## State of Ideal System

- A verified customer viewing an active ticket from the NFC/customer path sees a live service card that updates automatically without reloading the page.
- That card shows:
  - customer-safe service status
  - approximate distance band or rounded distance
  - rounded ETA
  - freshness such as "updated 1 min ago"
  - clear fallback messaging when live sharing is unavailable, stale, paused, or permission-denied
- Exact technician coordinates are never returned to customer clients or shown in the UI by default.
- Live tracking only starts after a real work transition controlled by the technician:
  - assigned alone is not enough
  - en route can start active travel sharing
  - start-work can switch customer messaging to "on site" / "service in progress"
- Live tracking stops automatically when the job exits the active-travel/service window, and stopping clears precise stored coordinates so only coarse derived state remains.
- Technician updates come from the existing technician mobile web/PWA flows, not from a separate native stack.
- Customer reads use the existing verified owner guard, not the unauthenticated ticket status route.
- MVP uses a clean server-owned contract and polling-based refresh because that matches the current Next.js app architecture and avoids introducing an unnecessary realtime infrastructure layer.

## Plan Phases

### Phase 1. Add a ticket-scoped live tracking model and privacy rules

**Files to read before starting**

- [`prisma/schema.prisma`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/prisma/schema.prisma)
- [`src/app/api/ticket/[id]/enroute/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/enroute/route.ts)
- [`src/app/api/ticket/[id]/start/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/start/route.ts)
- [`src/app/api/ticket/[id]/complete/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/complete/route.ts)
- [`src/app/api/ticket/[id]/confirm/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/confirm/route.ts)
- [`src/app/nfc/[id]/page.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/nfc/[id]/page.tsx)

**What to do**

- Add a new Prisma enum for ticket live tracking state, separate from `TicketStatus`. Recommended states:
  - `inactive`
  - `waiting_for_location`
  - `enroute`
  - `on_site`
  - `paused`
  - `stopped`
- Add a new one-row-per-ticket model, for example `TicketLiveStatus`, instead of trying to reuse `Technician.currentLocation`.
- Store only the minimum internal fields needed to derive customer-safe output:
  - `ticketId` unique
  - `technicianId`
  - live state
  - service anchor latitude/longitude if available
  - last technician latitude/longitude and accuracy for server-side computation only
  - rounded/derived customer fields such as `distanceKm`, `etaMinutes`, `lastUpdatedAt`
  - lifecycle timestamps such as `startedAt`, `arrivedAt`, `pausedAt`, `stoppedAt`
  - `metadata` JSON for small extensibility, not for the primary contract
- Do not use `Unsupported("point")` columns for the MVP write path. Keep the new model on plain numeric columns so normal Prisma CRUD works everywhere the feature needs it.
- Define a hard privacy rule in the implementation: when tracking stops, precise coordinates are nulled and only coarse derived state/timestamps remain.
- Define current stop semantics against today’s workflow:
  - stop on `pending_confirmation`, `resolved`, `closed`
  - stop on `escalated` unless the product team later decides escalated tickets should continue sharing
  - if a future `paused` or `cancelled` route is introduced, wire that route into the same stop helper

**Validation strategy**

- Prisma schema validates and client generation succeeds.
- Migration creates the new enum/model without mutating unrelated ticket flows.
- A test row can be created for an assigned ticket and later transitioned to `stopped` with coordinates cleared.

**Risks / fallbacks**

- Risk: overloading `Ticket.metadata` for the whole feature would make the contract hard to reason about and easy to break.
  - Fallback: keep metadata limited to optional extras and make the new table authoritative.
- Risk: the team may want location history later.
  - Fallback: keep MVP to latest-snapshot only; add a separate append-only history table only if product or compliance later requires it.

### Phase 2. Add auth-safe tracking APIs and lifecycle hooks

**Files to read before starting**

- [`src/lib/otp-session.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/otp-session.ts)
- [`src/app/api/ticket/[id]/status/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/status/route.ts)
- [`src/app/api/ticket/create/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/create/route.ts)
- [`src/app/api/ticket/[id]/enroute/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/enroute/route.ts)
- [`src/app/api/ticket/[id]/start/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/start/route.ts)
- [`src/app/api/ticket/[id]/complete/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/complete/route.ts)
- [`src/app/api/ticket/[id]/confirm/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/confirm/route.ts)
- [`src/components/nfc/customer-product-view.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/customer-product-view.tsx)

**What to do**

- Create a new dedicated route such as `src/app/api/ticket/[id]/tracking/route.ts` instead of extending the current unauthenticated [`src/app/api/ticket/[id]/status/route.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/api/ticket/[id]/status/route.ts).
- The new route should support:
  - `GET` for authorized viewers
  - `POST` for technician lifecycle/location updates
- `GET` contract:
  - allow verified owner access using the same `authorizeOwnerAccess(...)` pattern already used in ticket confirmation
  - allow technician/admin/service-center roles for internal views if needed
  - return only customer-safe fields: status label, tracking state, approximate distance/ETA, freshness, last updated timestamp, technician name/phone if already allowed by the current tracker
  - never return raw latitude/longitude
- `POST` contract:
  - technician-authenticated only
  - accept an explicit `action`, for example `start_tracking`, `heartbeat`, `arrived`, `pause`, `resume`, `stop`
  - accept current location sample fields only on actions that need them
  - compute customer-facing derived values on the server
- Add shared server helpers in a new live-tracking module under `src/lib/`, for example:
  - ownership/role authorization wrapper
  - service anchor extraction
  - haversine distance calculation
  - ETA rounding and freshness labeling
  - stop helper that clears precise coordinates
- Use a ticket-scoped service anchor, with this priority order:
  1. ticket-specific anchor captured during ticket reporting
  2. existing `product.installationLocation` if already populated
  3. fallback to ETA-only mode when no coordinates exist
- Extend the ticket create flow so the customer report request can optionally send a service location snapshot when the browser grants it. That gives the tracking system a stable job destination without waiting for a map provider.
- Wire lifecycle hooks into existing routes:
  - `enroute`: create or reactivate tracking row, preserve current ETA behavior, set tracking state to `waiting_for_location` until the first technician sample lands
  - `start`: mark `on_site`, record arrival timestamp, and reduce customer messaging from travel to visit-in-progress
  - `complete` and `confirm`: stop tracking and clear precise coordinates
- Add timeline entries for tracking lifecycle transitions only when they add customer/service value, not for every heartbeat.

**Validation strategy**

- Unauthorized customer requests to the new tracking `GET` route return `403`.
- Authorized owner requests succeed from both OTP session and Clerk phone-match paths.
- Technician `POST` calls on someone else’s ticket are rejected.
- Distance/ETA values are rounded before response and raw coordinates do not appear in serialized payloads.
- Ticket completion/confirmation leaves the ticket readable but the live row is in `stopped` state with precise coordinates removed.

**Risks / fallbacks**

- Risk: some products will not have a usable service anchor on day one.
  - Fallback: let the tracking route return `etaLabel` + freshness + "live location unavailable" instead of blocking the whole customer card.
- Risk: extending the old `/status` route would leak more data because it is currently unauthenticated.
  - Fallback: keep the new route separate and treat `/status` as legacy/internal until it is audited or retired.

### Phase 3. Capture technician location from the existing mobile/PWA flows

**Files to read before starting**

- [`src/components/technician/my-jobs-board.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/my-jobs-board.tsx)
- [`src/components/technician/job-detail.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/job-detail.tsx)
- [`src/components/nfc/staff-sticker-views.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/staff-sticker-views.tsx)
- [`src/components/pwa/pwa-runtime.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/pwa/pwa-runtime.tsx)
- [`src/hooks/use-online-status.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/hooks/use-online-status.ts)

**What to do**

- Add a shared client hook, for example `useTechnicianLiveTracking`, instead of duplicating browser geolocation logic in dashboard and sticker-scan flows.
- Start tracking only after the technician explicitly marks the job en route or begins work.
- Implementation shape for the hook:
  - request browser geolocation permission after the existing action succeeds
  - start `navigator.geolocation.watchPosition(...)`
  - throttle outbound heartbeats by both time and movement, for example every 15-30 seconds or after meaningful displacement
  - stop sending when the ticket completes, the component unmounts, the tab goes offline for too long, or the user explicitly pauses
- Update both technician surfaces:
  - dashboard job detail flow in [`src/components/technician/job-detail.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/job-detail.tsx)
  - sticker-scan quick-action flow in [`src/components/nfc/staff-sticker-views.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/staff-sticker-views.tsx)
- Add a visible technician status banner so the worker knows whether sharing is:
  - active
  - waiting for permission
  - paused
  - offline / retrying
- Keep the hook foreground-first and battery-aware. Do not attempt service-worker geolocation or other pseudo-background hacks for MVP.
- If location permission is denied:
  - keep the existing ticket state transitions working
  - preserve manual ETA from `/enroute`
  - send a one-time `pause`/`waiting_for_location` state so the customer card can explain the gap instead of looking broken

**Validation strategy**

- Manual mobile test on the technician dashboard:
  - mark en route
  - grant permission
  - confirm the route posts heartbeats
  - confirm stop happens on completion
- Manual sticker-scan test:
  - mark en route from the scan page
  - reload the page
  - verify tracking resumes from server state or degrades gracefully
- Deny permission and verify the job flow still works without blocking completion.
- Go offline mid-trip and verify the UI shows paused/stale state instead of repeatedly failing silently.

**Risks / fallbacks**

- Risk: location capture will behave differently between Android Chrome and iOS Safari/PWA.
  - Fallback: make the customer card freshness-aware and never promise uninterrupted background tracking.
- Risk: sending too many heartbeats will waste battery/data.
  - Fallback: keep the server contract stable and tune client throttle values without changing downstream UI contracts.

### Phase 4. Render customer-visible live status in the NFC/customer surfaces

**Files to read before starting**

- [`src/app/nfc/[id]/page.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/nfc/[id]/page.tsx)
- [`src/components/nfc/customer-ticket-tracker.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/customer-ticket-tracker.tsx)
- [`src/components/nfc/types.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/types.tsx)
- [`src/lib/nfc-i18n.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/lib/nfc-i18n.ts)
- [`src/app/(dashboard)/dashboard/customer/page.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/(dashboard)/dashboard/customer/page.tsx)

**What to do**

- Keep [`src/app/nfc/[id]/page.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/nfc/[id]/page.tsx) server-side for access control and data selection. Do not convert the whole page to a client component just to add polling.
- Add a focused client-side live status subcomponent, for example `customer-live-status-card.tsx`, that receives:
  - ticket id
  - initial live-tracking payload
  - current ticket status
  - language
- Poll the new tracking `GET` route on an interval only while:
  - the ticket is in `assigned`, `technician_enroute`, or `work_in_progress`
  - the document is visible
- Customer card content for MVP:
  - "Assigned"
  - "Technician is on the way"
  - "Technician has arrived / service started"
  - approximate distance or distance band
  - rounded ETA
  - freshness label
  - fallback text for stale/paused/unavailable sharing
- Do not show:
  - raw coordinates
  - a precise moving pin
  - a path trace
- Update the existing ticket view types in [`src/components/nfc/types.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/types.tsx) so live-tracking data is explicit rather than hidden inside generic metadata.
- Reuse the same derived payload in the customer dashboard card in [`src/app/(dashboard)/dashboard/customer/page.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/app/(dashboard)/dashboard/customer/page.tsx) if the effort is small. NFC tracker remains the primary MVP surface; dashboard reuse is a secondary win.

**Validation strategy**

- Open the customer NFC tracker on one device and technician flow on another.
- Verify the customer card updates within the polling window after:
  - en route begins
  - first heartbeat arrives
  - work starts
  - work completes
- Verify that stale data is labeled clearly when updates stop.
- Verify Hindi/English strings cover the new live-tracking states.
- Verify exact coordinates are absent from the customer network payload and rendered DOM.

**Risks / fallbacks**

- Risk: converting the existing tracker wholesale to client code would duplicate server access logic and make owner verification easier to regress.
  - Fallback: keep server page selection untouched and hydrate only the small polling card.
- Risk: customers may interpret stale data as current.
  - Fallback: treat freshness as a first-class field, not a secondary footnote.

### Phase 5. Optional future map enhancement after MVP stabilizes

**Files to read before starting**

- [`package.json`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/package.json)
- [`src/components/nfc/customer-ticket-tracker.tsx`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/nfc/customer-ticket-tracker.tsx)
- [`src/components/technician/utils.ts`](/Users/mallesh/code/Warranty/warranty.feedbacknfc.com/src/components/technician/utils.ts)

**What to do**

- Keep this phase explicitly optional. The current repo has no map SDK, no geocoder, and no routing provider abstraction, so the MVP should not take a dependency on map rendering.
- If product later wants a visual map:
  - add a provider abstraction at the server/helper layer first
  - render only a privacy-safe approximate zone or coarse position, not an exact pin by default
  - keep the same live-tracking API contract so the text card remains the primary experience
- Prefer a lightweight static or coarse-zone map before any full interactive route visualization.

**Validation strategy**

- Confirm provider selection, API keys, and mobile performance budget before implementation.
- Verify the map layer consumes only customer-safe fields or a separately redacted provider payload.

**Risks / fallbacks**

- Risk: introducing a map provider too early will expand scope into geocoding, key management, and client bundle weight.
  - Fallback: keep the text-based live status card as the canonical customer experience.

## Cross-provider Requirements

- Browser/platform support:
  - Android Chrome and installed PWAs are the best-fit technician capture environment.
  - iOS Safari/PWA can request geolocation, but background continuity is unreliable when the screen locks or the app is backgrounded.
  - MVP must therefore communicate freshness clearly and avoid product wording that implies guaranteed continuous background sharing.
- Network/security:
  - geolocation requires HTTPS in production
  - all live-tracking routes must remain server-authenticated and never trust a client-supplied technician id without session/role verification
- Privacy:
  - customer responses must contain only rounded or banded distance/ETA and freshness
  - precise coordinates should be internal-only and cleared on stop
  - no raw location should be included in SMS/WhatsApp messages
- Data quality:
  - if no service anchor coordinates exist, degrade to status + ETA + freshness instead of fabricating a distance
  - if geolocation permission is denied, keep ticket workflow intact and expose a non-broken fallback state to customers
- Future provider choice:
  - the MVP should not require Google Maps, Mapbox, or another vendor
  - if a routing/geocoding provider is added later, keep it behind a server helper so UI and auth contracts stay unchanged
