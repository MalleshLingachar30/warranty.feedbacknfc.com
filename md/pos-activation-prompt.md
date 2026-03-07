# ADE Prompt — Point-of-Sale Activation + Dual QR Sticker + OTP Access Control

Read WARRANTY-SPEC.md, WARRANTY-ACCESS-CONTROL.md, and WARRANTY-STICKER-MODE-SPEC.md before starting. This task implements two connected features:

**Feature A:** Point-of-Sale warranty activation with OTP-verified customer ownership  
**Feature B:** Dual QR sticker support (carton QR + product QR, same URL)  

These features together ensure that warranty activation happens at the retail counter with verified customer identity, and all future warranty actions (report issue, confirm resolution) are gated behind phone OTP verification of the registered owner.

---

## PART 1: DATABASE CHANGES

### 1.1 Add OTP sessions table

```sql
CREATE TABLE otp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    product_id UUID REFERENCES products(id),
    purpose VARCHAR(30) NOT NULL,              -- 'activation', 'report_issue', 'confirm_resolution', 'general_access'
    otp_code VARCHAR(6) NOT NULL,
    otp_expires_at TIMESTAMP NOT NULL,         -- 5 minutes from creation
    verified BOOLEAN DEFAULT false,
    session_token VARCHAR(255) UNIQUE,         -- issued after successful OTP verification
    session_expires_at TIMESTAMP,              -- 24 hours from verification
    attempts INTEGER DEFAULT 0,                -- max 3 attempts per OTP
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_sessions_token ON otp_sessions(session_token);
CREATE INDEX idx_otp_sessions_phone ON otp_sessions(phone, product_id);
```

### 1.2 Add scan log table

```sql
CREATE TABLE scan_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sticker_number INTEGER NOT NULL,
    product_id UUID REFERENCES products(id),
    scan_source VARCHAR(10),                   -- 'qr' or 'nfc' (from ?src= query param)
    scan_context VARCHAR(20),                  -- 'carton' or 'product' (from ?ctx= query param)
    viewer_type VARCHAR(30) NOT NULL,          -- 'owner_verified', 'owner_session', 'public', 'technician', 'admin', 'salesman_assisted'
    user_id UUID REFERENCES users(id),
    ip_address VARCHAR(45),
    user_agent TEXT,
    action_taken VARCHAR(50),                  -- 'view_only', 'activated', 'reported_issue', 'confirmed_resolution', 'started_work', 'completed_work'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scan_log_sticker ON scan_log(sticker_number, created_at);
```

### 1.3 Update products table

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS customer_phone_verified BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS activated_via VARCHAR(20) DEFAULT NULL;  -- 'carton_qr', 'product_qr', 'product_nfc', 'dashboard'
ALTER TABLE products ADD COLUMN IF NOT EXISTS activated_at_location VARCHAR(255) DEFAULT NULL;  -- optional: store/retailer name
```

### 1.4 Update sticker_allocations table

Add field to track whether carton QR labels are included in the allocation:

```sql
ALTER TABLE sticker_allocations ADD COLUMN IF NOT EXISTS include_carton_qr BOOLEAN DEFAULT true;
```

---

## PART 2: OTP API ROUTES

### 2.1 Request OTP: `POST /api/otp/request`

```
Body: {
    phone: string (required, E.164 format),
    productId: string (required, UUID),
    purpose: 'activation' | 'report_issue' | 'confirm_resolution' | 'general_access'
}
```

Logic:
1. Find the product by ID
2. If purpose is `activation`:
   - Product must be in `pending_activation` status
   - Any phone number is accepted (no ownership check yet — this IS the registration)
3. If purpose is `report_issue`, `confirm_resolution`, or `general_access`:
   - Product must have `customer_phone` set
   - The provided phone MUST match `products.customer_phone`
   - If phone doesn't match: return `{ error: "phone_mismatch", message: "This phone number is not registered as the product owner." }`
   - Do NOT reveal the correct phone number in the error response
4. Rate limit: max 3 OTP requests per phone per product per hour. If exceeded: return `{ error: "rate_limited", message: "Too many attempts. Please try again in 1 hour." }`
5. Generate random 6-digit OTP code
6. Create `otp_sessions` record with `otp_expires_at = NOW() + 5 minutes`
7. Send SMS via Twilio to the phone number: "Your FeedbackNFC verification code is: [OTP]. Valid for 5 minutes. Do not share this code."
8. Use customer's `language_preference` for SMS language (Hindi/English)
9. Return `{ success: true, message: "OTP sent", expiresInSeconds: 300 }`

### 2.2 Verify OTP: `POST /api/otp/verify`

```
Body: {
    phone: string,
    productId: string,
    otp: string (6 digits)
}
```

Logic:
1. Find matching `otp_sessions` record: same phone + productId, not expired, not yet verified, attempts < 3
2. If no record: return `{ error: "invalid", message: "No pending verification found." }`
3. If OTP doesn't match: increment `attempts`. Return `{ error: "wrong_otp", attemptsRemaining: 3 - attempts }`
4. If attempts exhausted (3 failed): return `{ error: "locked", message: "Too many failed attempts. Request a new code." }`
5. If OTP matches:
   - Set `otp_sessions.verified = true`
   - Generate `session_token` (UUID v4)
   - Set `session_expires_at = NOW() + 24 hours`
   - Set a httpOnly secure cookie named `warranty_session` with value = session_token, maxAge = 86400 seconds, sameSite = lax, secure = true, path = /
   - Return `{ success: true, sessionToken: session_token }`

### 2.3 Validate Session: internal helper function

Create `src/lib/otp-session.ts`:

```typescript
export async function validateOwnerSession(cookies, productId): Promise<{
    valid: boolean;
    phone?: string;
    productId?: string;
}> {
    const token = cookies.get('warranty_session')?.value;
    if (!token) return { valid: false };
    
    const session = await db.otpSessions.findFirst({
        where: {
            session_token: token,
            product_id: productId,
            verified: true,
            session_expires_at: { gt: new Date() }
        }
    });
    
    if (!session) return { valid: false };
    return { valid: true, phone: session.phone, productId: session.product_id };
}
```

---

## PART 3: UPDATE WARRANTY ACTIVATION FLOW

### 3.1 Activation Form — Now Requires OTP

The current activation form at `/nfc/[id]` for `pending_activation` products must be updated:

**Step 1: Product Details (read-only, already pre-filled)**
- Product image, name, model, manufacturer, serial number
- Warranty duration statement

**Step 2: Customer Details**
- Customer Name (required)
- Phone Number (required, with country code +91 prefix)
- Email (optional)
- Address (optional)
- Installation Date (default: today)

**Step 3: OTP Verification (NEW)**
- When customer fills Step 2 and taps "Continue", the system:
  - Calls `POST /api/otp/request` with purpose = `activation` and the entered phone
  - Shows OTP input field
  - Customer enters OTP received on their phone
  - Calls `POST /api/otp/verify`
  - On success: proceeds to activation

**Step 4: Activation Execution**
- On successful OTP verification:
  - Set `products.warranty_start_date = NOW()`
  - Calculate `products.warranty_end_date`
  - Set `products.warranty_status = 'active'`
  - Set `products.customer_phone = verified phone`
  - Set `products.customer_phone_verified = true`
  - Set `products.customer_name`, `customer_email`, etc.
  - Detect activation context from URL query params:
    - If URL has `?ctx=carton`: set `products.activated_via = 'carton_qr'`
    - If URL has `?ctx=product`: set `products.activated_via = 'product_qr'`
    - If URL has no ctx but has `?src=nfc`: set `products.activated_via = 'product_nfc'`
    - Default: `products.activated_via = 'product_qr'`
  - Create or update user record (role: customer)
  - Issue OTP session cookie (so customer has immediate access after activation)
  - Send activation SMS: "Your [Product Name] warranty is active until [date]. Scan the sticker on your product anytime for service."
  - Send warranty certificate link in SMS if available
  - Log in scan_log: action = 'activated', viewer_type = 'owner_verified', scan_context from query param

**Step 5: Success Screen**
- Show animated confirmation: "Warranty Activated!"
- Show warranty end date prominently
- Show "Download Warranty Certificate" button
- Show important message: **"A warranty sticker is on your product. Scan it anytime you need service. Keep it safe — don't remove or damage the sticker."**
- This message is critical for carton-QR activations where the customer might not know about the product sticker

### 3.2 Point-of-Sale Activation Context

The carton QR code will encode a slightly different URL than the product sticker:

- **Carton QR URL:** `warranty.feedbacknfc.com/nfc/50001?ctx=carton`
- **Product sticker QR URL:** `warranty.feedbacknfc.com/nfc/50001?ctx=product`
- **Product sticker NFC URL:** `warranty.feedbacknfc.com/nfc/50001` (NFC tap, no query params)

All three resolve to the same sticker number (50001) and the same product. The `ctx` parameter is for analytics only — it tells the system whether activation happened at the store (carton) or at home (product sticker).

The page logic does NOT change based on `ctx`. The activation form is identical. The `ctx` value is simply stored in `products.activated_via` and `scan_log.scan_context` for manufacturer analytics.

---

## PART 4: UPDATE STICKER ROUTE — ACCESS CONTROL

### 4.1 Revised `/nfc/[id]/page.tsx` Decision Tree

Replace the current sticker page logic with this access-controlled version:

```typescript
async function StickerPage({ params, searchParams }) {
    const stickerId = parseInt(params.id);
    const source = searchParams.src || 'unknown';
    const context = searchParams.ctx || 'product';
    const lang = searchParams.lang || null;
    
    // 1. Sticker + product lookup (unchanged)
    const sticker = await db.stickers.findByNumber(stickerId);
    if (!sticker) return <StickerNotFound />;
    
    const product = await db.products.findByStickerId(sticker.id);
    if (!product) return <StickerNotBound sticker={sticker} />;
    
    // 2. Pending activation — open to anyone (activation captures identity)
    if (product.warranty_status === 'pending_activation') {
        logScan(stickerId, product.id, source, context, 'public', null, 'view_activation');
        return <WarrantyActivation product={product} context={context} />;
    }
    
    // 3. Check Clerk authentication (technician/admin)
    const clerkUser = await getCurrentUser();
    if (clerkUser) {
        const dbUser = await db.users.findByClerkId(clerkUser.id);
        
        // 3a. Assigned technician → full work interface
        if (dbUser?.role === 'technician') {
            const openTicket = await db.tickets.findOpenByProductId(product.id);
            if (openTicket && openTicket.assigned_technician_id === dbUser.technician?.id) {
                logScan(stickerId, product.id, source, context, 'technician', dbUser.id, 'view_work_order');
                return <TechnicianWorkView ticket={openTicket} product={product} />;
            }
            // Not assigned — read-only public view
            logScan(stickerId, product.id, source, context, 'technician', dbUser.id, 'view_only');
            return <PublicProductView product={product} />;
        }
        
        // 3b. Admin — read-only full view
        if (dbUser?.role === 'service_center_admin' || dbUser?.role === 'manufacturer_admin') {
            logScan(stickerId, product.id, source, context, 'admin', dbUser.id, 'view_only');
            return <AdminProductView product={product} />;
        }
        
        // 3c. Logged-in customer with matching phone — full owner access (no OTP needed)
        if (dbUser?.role === 'customer' && dbUser.phone === product.customer_phone) {
            logScan(stickerId, product.id, source, context, 'owner_verified', dbUser.id, 'view_full');
            return <OwnerProductView product={product} />;
        }
    }
    
    // 4. Check OTP session cookie
    const session = await validateOwnerSession(cookies(), product.id);
    if (session.valid) {
        logScan(stickerId, product.id, source, context, 'owner_session', null, 'view_full');
        return <OwnerProductView product={product} />;
    }
    
    // 5. No identity verified — public read-only view
    logScan(stickerId, product.id, source, context, 'public', null, 'view_only');
    return <PublicProductView product={product} />;
}
```

### 4.2 PublicProductView Component (NEW)

This is what unverified visitors see. Build as a new component at `src/components/nfc/public-product-view.tsx`:

**Shows:**
- Product name, model number, manufacturer name
- Product image (if available)
- Warranty status badge: Active (green) / Expired (red)
- Warranty valid-until date
- Message: "This product is registered to a verified owner."

**Does NOT show:**
- Owner name, phone, email, address
- Serial number (partial security — reduces information leakage)
- Service history details
- Report Issue button
- Confirm Resolution button
- Download Certificate button

**Shows at bottom:**
- OTP verification card:
  ```
  ┌─────────────────────────────────┐
  │  Are you the product owner?     │
  │                                 │
  │  Verify your identity to access │
  │  warranty services.             │
  │                                 │
  │  Phone: [+91 ___________]      │
  │  [Verify with OTP]              │
  └─────────────────────────────────┘
  ```

**OTP inline flow within this component:**
1. User enters phone → taps "Verify with OTP"
2. Component calls `POST /api/otp/request` with purpose = `general_access`
3. If phone matches registered owner → OTP sent → show OTP input field
4. If phone doesn't match → show error: "This phone number is not registered as the product owner. Contact support for help."
5. User enters OTP → component calls `POST /api/otp/verify`
6. On success → page reloads (or client-side state update) → now renders OwnerProductView instead
7. On failure → show "Incorrect code. [X] attempts remaining."

**Must support Hindi:** All labels in this component must use the i18n system (`nfc-i18n.ts`). Include translations for: "This product is registered to a verified owner", "Are you the product owner?", "Verify with OTP", "Phone number does not match", etc.

### 4.3 OwnerProductView Component (UPDATED)

Rename/refactor the current customer product view to `OwnerProductView`. This is what the verified owner sees. It should be identical to the current `CustomerProductView` but:
- Show a small "✓ Verified Owner" badge at the top
- Show full product details including serial number
- Show full service history
- Show Report Issue button (when no open ticket and warranty is active)
- Show Confirm Resolution button (when ticket is in pending_confirmation)
- Show Download Certificate button

**Report Issue button behavior change:** When the owner taps "Report Issue":
- If OTP session is still active (within 24 hours) → open issue form directly, no re-verification
- If OTP session expired → show OTP re-verification before opening issue form
- If owner is logged in via Clerk with matching phone → open issue form directly, no OTP needed

**Confirm Resolution button behavior change:** Same logic as Report Issue — verify session is still valid before allowing the action.

### 4.4 AdminProductView Component (NEW)

For signed-in service center admins and manufacturer admins who scan the sticker. Shows:
- Full product details (name, model, serial, manufacturer)
- Warranty status and dates
- Full service history with all ticket details
- Customer name and phone (admins need this for operational purposes)
- No action buttons (admins manage via their dashboards, not the sticker page)
- Link: "Manage in Dashboard →" pointing to the relevant dashboard page

---

## PART 5: API ROUTE GUARDS

### 5.1 Guard: POST /api/ticket/create

Before creating a ticket, verify the requester is the product owner:

```typescript
// Add at the beginning of the ticket creation handler:

const product = await db.products.findById(body.productId);

// Check 1: Clerk user with matching phone
const clerkUser = await getCurrentUser();
if (clerkUser) {
    const dbUser = await db.users.findByClerkId(clerkUser.id);
    if (dbUser?.phone === product.customer_phone) {
        // Authorized — proceed to create ticket
    }
}

// Check 2: Valid OTP session for this product
const session = await validateOwnerSession(cookies(), product.id);
if (session.valid && session.phone === product.customer_phone) {
    // Authorized — proceed to create ticket
}

// Neither — reject
return NextResponse.json(
    { error: "unauthorized", message: "Owner verification required to report an issue." },
    { status: 403 }
);
```

### 5.2 Guard: POST /api/ticket/[id]/confirm

Same dual-check pattern. Additionally verify ticket status is `pending_confirmation`.

### 5.3 Existing technician guards

Verify that the existing technician API routes (`/api/ticket/[id]/start`, `/api/ticket/[id]/complete`, `/api/ticket/[id]/enroute`) already check:
1. Clerk session is active
2. User role is `technician`
3. User is the assigned technician for this specific ticket

If any of these checks are missing, add them.

---

## PART 6: DUAL QR STICKER SUPPORT IN ALLOCATION

### 6.1 Update Bulk Allocation Wizard

Add a checkbox in Step 1 of the allocation wizard:

```
☑ Include carton QR labels (recommended for retail activation)
```

Default: checked.

When checked, the allocation summary (Step 4) shows:
```
Sticker Range: FNFC-050001 to FNFC-060000
Product Model: Kent Pearl 8L RO
Appliance Serial Range: KNT-WP-240001 to KNT-WP-250000
Total: 10,000 units

Sticker Deliverables:
✓ 10,000 product stickers (tamper-evident, QR: warranty.feedbacknfc.com/nfc/[N]?ctx=product)
✓ 10,000 carton QR labels (paper, QR: warranty.feedbacknfc.com/nfc/[N]?ctx=carton)
```

Store `include_carton_qr = true` in the `sticker_allocations` record.

### 6.2 Update QR Code Generation Tool

When generating QR codes for an allocation that has `include_carton_qr = true`, the tool must generate TWO sets:

**Set 1 — Product Sticker QR Codes:**
- URL pattern: `warranty.feedbacknfc.com/nfc/50001?ctx=product`
- File naming: `product-FNFC-050001.png`
- CSV column header: `sticker_number, serial, product_qr_url`

**Set 2 — Carton QR Labels:**
- URL pattern: `warranty.feedbacknfc.com/nfc/50001?ctx=carton`
- File naming: `carton-FNFC-050001.png`
- CSV column header: `sticker_number, serial, carton_qr_url`

Both sets should be downloadable separately:
- "Download Product Sticker QR Codes" button
- "Download Carton QR Labels" button
- "Download Combined CSV" button (both URLs in one CSV for the printer)

Combined CSV format:
```csv
sticker_number,serial,product_qr_url,carton_qr_url
50001,FNFC-050001,warranty.feedbacknfc.com/nfc/50001?ctx=product,warranty.feedbacknfc.com/nfc/50001?ctx=carton
50002,FNFC-050002,warranty.feedbacknfc.com/nfc/50002?ctx=product,warranty.feedbacknfc.com/nfc/50002?ctx=carton
```

### 6.3 Carton QR Label Design (in PDF generation)

The carton QR label should be a simpler, cheaper design than the product sticker:
- Size: 30mm × 40mm
- Content: QR code (25mm), manufacturer logo (small), text: "Activate Warranty Now" / "अभी वारंटी सक्रिय करें"
- No tamper-evident features needed (carton is disposable)
- No serial number printed (keeps the label clean and simple)

---

## PART 7: MANUFACTURER ANALYTICS — ACTIVATION INSIGHTS

### 7.1 New Analytics Cards on Manufacturer Dashboard

Add to `/dashboard/manufacturer/analytics`:

**Activation Source Breakdown:**
- Pie chart showing: Carton QR (point of sale) vs Product QR (at home) vs Product NFC (tap at home)
- Data source: `products.activated_via` field

**Activation Rate:**
- Metric: (activated products / total bound products) × 100
- Trend line over time (daily/weekly)

**Average Time to Activation:**
- Metric: average days between `products.created_at` (allocation date) and `products.warranty_start_date` (activation date)
- Breakdown by activation source (carton vs product)
- Carton QR activations should show ~0 days (same day as purchase). Product sticker activations may show 1-7 days (customer activates at home later).

**Retail Activation Rate:**
- If carton QR activations are high → retail sales channel is working well
- If product sticker activations dominate → retailers aren't promoting point-of-sale activation → manufacturer needs to train retail staff

---

## PART 8: UPDATE SMS TEMPLATES

### 8.1 OTP SMS
```
EN: "Your FeedbackNFC verification code is: {OTP}. Valid for 5 minutes. Do not share this code."
HI: "आपका FeedbackNFC सत्यापन कोड है: {OTP}। 5 मिनट के लिए वैध। यह कोड किसी से साझा न करें।"
```

### 8.2 Activation Success SMS (updated)
```
EN: "Your {productName} warranty is now active until {endDate}. A warranty sticker is on your product — scan it anytime for service. Certificate: {certificateLink}"
HI: "आपकी {productName} वारंटी {endDate} तक सक्रिय है। आपके उत्पाद पर वारंटी स्टिकर लगा है — सेवा के लिए कभी भी स्कैन करें। प्रमाणपत्र: {certificateLink}"
```

### 8.3 Phone Mismatch (not sent via SMS — shown in UI only)
```
EN: "This phone number is not registered as the product owner. If you recently purchased this product, contact support for ownership transfer."
HI: "यह फ़ोन नंबर उत्पाद मालिक के रूप में पंजीकृत नहीं है। यदि आपने हाल ही में यह उत्पाद खरीदा है, तो स्वामित्व हस्तांतरण के लिए सहायता से संपर्क करें।"
```

---

## PART 9: TESTING CHECKLIST

After implementation, verify:

- [ ] **Activation with OTP:** Open `/nfc/50` (pending activation). Enter name + phone. Receive OTP. Enter OTP. Warranty activates. Session cookie is set.
- [ ] **Carton vs product tracking:** Activate via `/nfc/50?ctx=carton`. Check `products.activated_via = 'carton_qr'`. Activate another via `/nfc/51?ctx=product`. Check `products.activated_via = 'product_qr'`.
- [ ] **Owner access after activation:** After activation, page shows OwnerProductView with Report Issue button and certificate download. No OTP re-prompt (session is active).
- [ ] **Owner access after session expires:** Clear cookies. Open `/nfc/50`. Page shows PublicProductView (read-only). Tap "Verify with OTP". Enter registered phone. Receive OTP. Verify. Page now shows OwnerProductView.
- [ ] **Wrong phone number:** On PublicProductView, enter a different phone number. System returns "phone not registered" error. OTP is NOT sent. No information leaked about correct phone.
- [ ] **Stranger access:** Open `/nfc/100` in a fresh incognito window. See PublicProductView: product name, model, warranty status, manufacturer. Do NOT see: owner name, phone, serial number, service history, Report Issue button, Confirm Resolution button.
- [ ] **Report Issue requires verification:** Try calling `POST /api/ticket/create` without a valid session cookie or Clerk login. Should return 403 Unauthorized.
- [ ] **Confirm Resolution requires verification:** Try calling `POST /api/ticket/[id]/confirm` without a valid session cookie or Clerk login. Should return 403 Unauthorized.
- [ ] **Technician can only act on assigned jobs:** Sign in as technician. Open `/nfc/100`. If not assigned to this product's ticket, see PublicProductView (read-only). If assigned, see TechnicianWorkView.
- [ ] **Technician cannot confirm resolution:** Verify there is no code path where a technician's Clerk session satisfies the ownership check for confirmation.
- [ ] **Rate limiting:** Request OTP 4 times for the same phone + product within an hour. 4th request should be rejected.
- [ ] **OTP expiry:** Request OTP. Wait 6 minutes. Enter OTP. Should fail (expired).
- [ ] **QR generation tool:** Allocate stickers with "Include carton QR labels" checked. Download product QR CSV and carton QR CSV. Verify URLs include correct `?ctx=` parameters.
- [ ] **Hindi support:** Test all new UI strings (PublicProductView, OTP prompts, error messages) with `?lang=hi`.
- [ ] **Scan logging:** After several test scans, check `scan_log` table. Verify entries include correct `viewer_type`, `scan_context`, and `action_taken` values.
- [ ] **Analytics:** Check manufacturer analytics page for activation source breakdown chart.

---

## IMPLEMENTATION ORDER

1. Database migrations (otp_sessions, scan_log, products columns, sticker_allocations column)
2. OTP API routes (request, verify, session validation helper)
3. Update warranty activation flow with OTP step
4. Create PublicProductView component with inline OTP verification
5. Rename current customer view to OwnerProductView, add verified badge
6. Create AdminProductView component
7. Update `/nfc/[id]/page.tsx` with the full decision tree
8. Add API guards to ticket creation and resolution confirmation
9. Verify existing technician API guards
10. Update allocation wizard with carton QR checkbox
11. Update QR generation tool for dual QR output
12. Add activation analytics to manufacturer dashboard
13. Add Hindi translations for all new strings
14. Run full testing checklist

All steps can be implemented in this order within a single agent session. The changes are sequential and build on each other.
