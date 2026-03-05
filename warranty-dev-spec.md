# FeedbackNFC Warranty Platform — Development Specification

**Project:** warranty.feedbacknfc.com (Full Application Build)  
**Base Reference:** Clone and extend from asset.feedbacknfc.com  
**Date:** March 04, 2026  
**Status:** Ready for development

---

## 1. PROJECT OVERVIEW

### 1.1 What We're Building

A full-stack warranty management platform that enables manufacturers, service centers, and end customers to manage product warranties through NFC stickers and QR codes. The platform uses the same "tap, tap, tap" workflow proven in asset.feedbacknfc.com but adapted for the warranty lifecycle:

1. **Manufacturer binds** sticker to product (bulk allocation)
2. **Customer scans** QR/taps NFC → warranty activates, service request submitted
3. **AI assigns** the nearest qualified technician
4. **Technician scans** same sticker → sees work order, asset history, parts needed
5. **Technician scans** again → marks work complete with photos and documentation
6. **Customer scans** → confirms resolution
7. **System auto-generates** warranty claim for manufacturer reimbursement

### 1.2 What Already Exists

- **asset.feedbacknfc.com** — Full working application with authentication (Clerk), NFC tap routing (`/nfc/[id]`), context-aware interfaces, ticket lifecycle, technician assignment, admin dashboard. **Clone this as the base.**
- **warranty.feedbacknfc.com** — Landing page only (static marketing page). Replace with full application while preserving landing page as the public home route.
- **feedbacknfc.com/nfc/[number]** — Existing NFC URL routing pattern. The warranty platform will use the SAME URL pattern for both NFC and QR stickers.

### 1.3 Key Difference from Asset Platform

The asset platform serves **one organization** managing its own internal assets and internal technicians. The warranty platform serves **multiple parties** across a supply chain:

| Role | Asset Platform | Warranty Platform |
|---|---|---|
| Asset Owner | Single company | End customer (consumer) |
| Service Provider | Internal IT/maintenance team | External authorized service centers |
| Admin | Facility manager | Manufacturer + distributor |
| Billing | Internal cost center | Cross-party reimbursement (claim) |
| Registration | Admin registers assets | Bulk allocation by manufacturer + activation by customer |

---

## 2. TECH STACK

Maintain consistency with existing FeedbackNFC projects:

```
Framework:       Next.js 14+ (App Router)
Language:        TypeScript
Styling:         Tailwind CSS
UI Components:   shadcn/ui + Lucide React icons
Authentication:  Clerk (same as asset.feedbacknfc.com)
Database:        PostgreSQL (Neon or Supabase)
ORM:             Prisma (or Drizzle — match asset platform)
File Storage:    Supabase Storage / AWS S3 (photos, claim docs)
Hosting:         Vercel
Notifications:   Twilio (SMS) + WhatsApp Business API + Resend (email)
AI/ML:           OpenAI API (technician matching, issue categorization)
Charts:          Recharts
State Mgmt:      Zustand (or React Context — match asset platform)
i18n:            next-intl (English, Hindi, Tamil, Kannada, Telugu, Arabic)
PDF Generation:  @react-pdf/renderer (warranty certificates, claim reports)
QR Generation:   qrcode npm package (admin bulk generation tool)
```

---

## 3. URL STRUCTURE AND ROUTING

### 3.1 Subdomain: warranty.feedbacknfc.com

| Route | Purpose | Auth Required |
|---|---|---|
| `/` | Landing page (existing marketing page) | No |
| `/sign-in` | Clerk sign-in | No |
| `/sign-up` | Clerk sign-up with role selection | No |
| `/nfc/[id]` | **Smart sticker route** — context-aware page (see Section 5) | No (public) |
| `/dashboard` | Role-based dashboard redirect | Yes |
| `/dashboard/manufacturer` | Manufacturer admin panel | Yes (manufacturer role) |
| `/dashboard/service-center` | Service center panel | Yes (service-center role) |
| `/dashboard/technician` | Technician mobile dashboard | Yes (technician role) |
| `/dashboard/customer` | Customer portal (my products, warranty status) | Yes (customer role) |
| `/admin` | Super admin (FeedbackNFC internal) | Yes (super-admin role) |
| `/api/...` | API routes | Varies |

### 3.2 Shared NFC/QR Route: feedbacknfc.com/nfc/[id]

This is the critical route. The same URL `https://feedbacknfc.com/nfc/12345` works whether accessed via NFC tap or QR scan. The routing logic:

```
User hits feedbacknfc.com/nfc/[id]
    │
    ├── Is this ID allocated to warranty platform?
    │       YES → Redirect to warranty.feedbacknfc.com/nfc/[id]
    │       NO  → Redirect to asset.feedbacknfc.com/nfc/[id] (existing behavior)
    │
    └── At warranty.feedbacknfc.com/nfc/[id]:
            │
            ├── Is this sticker bound to a product?
            │       NO  → Show "Unregistered Sticker" page
            │       YES → Continue...
            │
            ├── Is user authenticated?
            │       NO  → Show customer-facing public interface
            │       YES → Check user role and show appropriate interface
            │
            ├── Customer role (or unauthenticated):
            │       ├── First scan ever? → Activate warranty + register customer
            │       ├── Active warranty, no open ticket? → Show product info + "Report Issue" button
            │       ├── Open ticket exists? → Show ticket status tracker
            │       └── Ticket pending confirmation? → Show "Confirm Resolution" button
            │
            ├── Technician role:
            │       ├── Assigned to this ticket? → Show work order details
            │       ├── Work in progress? → Show "Mark Complete" form (photos, parts, notes)
            │       └── Not assigned? → Show read-only asset info
            │
            └── Manager/Service Center role:
                    └── Show analytics view (service history, costs, performance)
```

---

## 4. DATABASE SCHEMA

### 4.1 Core Tables

#### organizations
Manufacturers, distributors, and service centers that use the platform.

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type ENUM('manufacturer', 'distributor', 'service_center', 'retailer') NOT NULL,
    slug VARCHAR(100) UNIQUE,
    logo_url TEXT,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(50) DEFAULT 'IN',
    pincode VARCHAR(10),
    gst_number VARCHAR(20),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    settings JSONB DEFAULT '{}',
    subscription_tier ENUM('pilot', 'starter', 'professional', 'enterprise') DEFAULT 'pilot',
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### users
All platform users linked to Clerk authentication.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    email VARCHAR(255),
    phone VARCHAR(20),
    name VARCHAR(255),
    role ENUM('super_admin', 'manufacturer_admin', 'service_center_admin', 'technician', 'customer') NOT NULL,
    language_preference VARCHAR(5) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### product_models
Product catalog — models registered by manufacturers.

```sql
CREATE TABLE product_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'water_purifier', 'ac', 'geyser', 'medical_ventilator', etc.
    sub_category VARCHAR(100),
    model_number VARCHAR(100),
    description TEXT,
    image_url TEXT,
    warranty_duration_months INTEGER NOT NULL DEFAULT 12,
    extended_warranty_available BOOLEAN DEFAULT false,
    extended_warranty_months INTEGER,
    specifications JSONB DEFAULT '{}', -- brand-specific fields
    common_issues JSONB DEFAULT '[]', -- pre-defined issue types for AI categorization
    required_skills TEXT[], -- skills needed for service
    parts_catalog JSONB DEFAULT '[]', -- common replacement parts
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### stickers
Each physical sticker (QR-only or NFC+QR) registered in the system.

```sql
CREATE TABLE stickers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sticker_number INTEGER UNIQUE NOT NULL, -- sequential: 1, 2, 3... (maps to /nfc/[number])
    sticker_serial VARCHAR(20) UNIQUE NOT NULL, -- human-readable: FNFC-000001
    type ENUM('qr_only', 'nfc_qr', 'nfc_only') NOT NULL DEFAULT 'qr_only',
    variant ENUM('standard', 'high_temp', 'premium') NOT NULL DEFAULT 'standard',
    status ENUM('unallocated', 'allocated', 'bound', 'activated', 'deactivated') DEFAULT 'unallocated',
    allocated_to_org UUID REFERENCES organizations(id), -- which manufacturer received this batch
    batch_id VARCHAR(50), -- print batch reference
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookup from NFC/QR scan
CREATE INDEX idx_stickers_number ON stickers(sticker_number);
```

#### products
Individual product units — created when a sticker is bound to a product.

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sticker_id UUID REFERENCES stickers(id) UNIQUE NOT NULL,
    product_model_id UUID REFERENCES product_models(id) NOT NULL,
    organization_id UUID REFERENCES organizations(id) NOT NULL, -- manufacturer
    serial_number VARCHAR(255), -- manufacturer's serial number
    manufacture_date DATE,
    sale_date DATE,
    installation_date DATE,
    warranty_start_date TIMESTAMP, -- set on first customer scan (activation)
    warranty_end_date TIMESTAMP, -- calculated: start + product_model.warranty_duration_months
    warranty_status ENUM('pending_activation', 'active', 'expired', 'extended', 'voided') DEFAULT 'pending_activation',
    extended_warranty_end_date TIMESTAMP,
    customer_id UUID REFERENCES users(id), -- set on first customer scan
    customer_name VARCHAR(255), -- captured at activation (for unauthenticated customers)
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    customer_address TEXT,
    customer_city VARCHAR(100),
    customer_state VARCHAR(100),
    customer_pincode VARCHAR(10),
    installation_location JSONB, -- GPS coordinates if available
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for warranty expiry queries
CREATE INDEX idx_products_warranty ON products(warranty_status, warranty_end_date);
```

#### service_centers
Authorized service centers with their coverage areas and capabilities.

```sql
CREATE TABLE service_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    location POINT, -- GPS coordinates for proximity matching
    service_radius_km INTEGER DEFAULT 50,
    supported_categories TEXT[], -- ['ac', 'water_purifier', 'geyser']
    manufacturer_authorizations UUID[], -- which manufacturer orgs they serve
    operating_hours JSONB, -- {"mon": {"open": "09:00", "close": "18:00"}, ...}
    is_active BOOLEAN DEFAULT true,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_jobs_completed INTEGER DEFAULT 0,
    average_resolution_hours DECIMAL(6,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Spatial index for proximity queries
CREATE INDEX idx_service_centers_location ON service_centers USING GIST(location);
```

#### technicians
Individual technicians belonging to service centers.

```sql
CREATE TABLE technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) UNIQUE NOT NULL,
    service_center_id UUID REFERENCES service_centers(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    skills TEXT[] NOT NULL, -- ['ac_repair', 'refrigerator', 'washing_machine']
    certifications JSONB DEFAULT '[]',
    is_available BOOLEAN DEFAULT true,
    current_location POINT,
    max_concurrent_jobs INTEGER DEFAULT 3,
    active_job_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_jobs_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### tickets
Service requests — the core workflow entity.

```sql
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL, -- WRT-2026-000001
    product_id UUID REFERENCES products(id) NOT NULL,
    sticker_id UUID REFERENCES stickers(id) NOT NULL,
    
    -- Requester info
    reported_by_user_id UUID REFERENCES users(id),
    reported_by_name VARCHAR(255),
    reported_by_phone VARCHAR(20) NOT NULL,
    
    -- Issue details
    issue_category VARCHAR(100), -- AI-categorized or user-selected
    issue_description TEXT NOT NULL,
    issue_severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    issue_photos TEXT[], -- URLs to uploaded photos
    
    -- Assignment
    assigned_service_center_id UUID REFERENCES service_centers(id),
    assigned_technician_id UUID REFERENCES technicians(id),
    assignment_method ENUM('ai_auto', 'manual', 'escalated') DEFAULT 'ai_auto',
    assignment_notes TEXT,
    
    -- Lifecycle timestamps
    reported_at TIMESTAMP DEFAULT NOW(),
    assigned_at TIMESTAMP,
    technician_started_at TIMESTAMP, -- technician taps sticker to start
    technician_completed_at TIMESTAMP, -- technician taps sticker to complete
    customer_confirmed_at TIMESTAMP, -- customer taps sticker to confirm
    closed_at TIMESTAMP,
    
    -- Resolution
    status ENUM(
        'reported',           -- customer submitted
        'assigned',           -- AI/admin assigned technician
        'technician_enroute', -- technician accepted
        'work_in_progress',   -- technician tapped to start
        'pending_confirmation', -- technician marked complete, waiting customer
        'resolved',           -- customer confirmed
        'reopened',           -- customer disputed resolution
        'escalated',          -- auto-escalated due to SLA breach
        'closed'              -- final state
    ) DEFAULT 'reported',
    
    -- Resolution documentation
    resolution_notes TEXT,
    resolution_photos TEXT[],
    parts_used JSONB DEFAULT '[]', -- [{"part_name": "Compressor", "part_number": "XYZ", "cost": 3500}]
    labor_hours DECIMAL(4,2),
    
    -- Warranty claim
    claim_id UUID REFERENCES warranty_claims(id),
    is_warranty_covered BOOLEAN DEFAULT true,
    
    -- SLA tracking
    sla_response_deadline TIMESTAMP, -- must assign within X hours
    sla_resolution_deadline TIMESTAMP, -- must resolve within Y hours
    sla_breached BOOLEAN DEFAULT false,
    
    -- Escalation
    escalation_level INTEGER DEFAULT 0,
    escalated_at TIMESTAMP,
    escalation_reason TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_product ON tickets(product_id);
CREATE INDEX idx_tickets_technician ON tickets(assigned_technician_id);
```

#### warranty_claims
Auto-generated claims for manufacturer reimbursement.

```sql
CREATE TABLE warranty_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_number VARCHAR(20) UNIQUE NOT NULL, -- CLM-2026-000001
    ticket_id UUID REFERENCES tickets(id) NOT NULL,
    product_id UUID REFERENCES products(id) NOT NULL,
    manufacturer_org_id UUID REFERENCES organizations(id) NOT NULL,
    service_center_org_id UUID REFERENCES organizations(id) NOT NULL,
    
    -- Claim details
    claim_type ENUM('warranty_repair', 'warranty_replacement', 'extended_warranty', 'goodwill') DEFAULT 'warranty_repair',
    parts_cost DECIMAL(10,2) DEFAULT 0.00,
    labor_cost DECIMAL(10,2) DEFAULT 0.00,
    total_claim_amount DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'INR',
    
    -- Documentation (auto-generated from ticket)
    documentation JSONB DEFAULT '{}', -- compiled from ticket photos, notes, timestamps
    documentation_pdf_url TEXT, -- generated PDF claim report
    
    -- Approval workflow
    status ENUM(
        'auto_generated',     -- system created after ticket resolution
        'submitted',          -- service center submitted to manufacturer
        'under_review',       -- manufacturer reviewing
        'approved',           -- manufacturer approved
        'rejected',           -- manufacturer rejected (with reason)
        'disputed',           -- service center disputes rejection
        'paid',               -- payment processed
        'closed'
    ) DEFAULT 'auto_generated',
    
    rejection_reason TEXT,
    approved_amount DECIMAL(10,2),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    
    -- Payment tracking
    payment_reference VARCHAR(255),
    paid_at TIMESTAMP,
    payment_method VARCHAR(50),
    
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### ticket_timeline
Audit trail of all state changes — every tap, every update.

```sql
CREATE TABLE ticket_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'assigned', 'technician_started', 'photo_added', 'completed', 'confirmed', etc.
    event_description TEXT,
    actor_user_id UUID REFERENCES users(id),
    actor_role VARCHAR(50),
    actor_name VARCHAR(255),
    metadata JSONB DEFAULT '{}', -- GPS location, device info, photos, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_timeline_ticket ON ticket_timeline(ticket_id, created_at);
```

#### sticker_allocations
Bulk allocation log — tracks which sticker ranges go to which manufacturer.

```sql
CREATE TABLE sticker_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    sticker_start_number INTEGER NOT NULL,
    sticker_end_number INTEGER NOT NULL,
    total_count INTEGER NOT NULL,
    product_model_id UUID REFERENCES product_models(id), -- optional: pre-assign to a model
    allocation_type ENUM('bulk_bind', 'reserve_only') DEFAULT 'bulk_bind',
    
    -- For bulk_bind: manufacturer provides their serial range
    appliance_serial_prefix VARCHAR(50),
    appliance_serial_start VARCHAR(100),
    appliance_serial_end VARCHAR(100),
    
    allocated_by UUID REFERENCES users(id),
    allocated_at TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. SMART STICKER ROUTE — CONTEXT-AWARE LOGIC

This is the heart of the application. Route: `/nfc/[id]`

### 5.1 Page Component Logic (pseudocode)

```typescript
// app/nfc/[id]/page.tsx

async function StickerPage({ params }: { params: { id: string } }) {
    const stickerId = parseInt(params.id);
    
    // 1. Look up sticker
    const sticker = await db.stickers.findByNumber(stickerId);
    if (!sticker) return <StickerNotFound />;
    if (sticker.status === 'unallocated') return <UnregisteredSticker />;
    
    // 2. Look up bound product
    const product = await db.products.findByStickerId(sticker.id);
    if (!product) return <StickerNotBound sticker={sticker} />;
    
    // 3. Check authenticated user
    const user = await getCurrentUser(); // Clerk
    const userRole = user?.role || 'anonymous_customer';
    
    // 4. Check for open tickets on this product
    const openTicket = await db.tickets.findOpenByProductId(product.id);
    
    // 5. Route to appropriate view
    switch (userRole) {
        case 'anonymous_customer':
        case 'customer':
            if (product.warranty_status === 'pending_activation') {
                return <WarrantyActivation product={product} />;
            }
            if (!openTicket) {
                return <CustomerProductView product={product} />;
                // Shows product info, warranty status, "Report Issue" button
            }
            if (openTicket.status === 'pending_confirmation') {
                return <CustomerConfirmResolution ticket={openTicket} />;
            }
            return <CustomerTicketTracker ticket={openTicket} />;
            
        case 'technician':
            if (!openTicket) return <TechnicianAssetInfo product={product} />;
            if (openTicket.assigned_technician_id !== user.technicianId) {
                return <TechnicianAssetInfo product={product} />;
            }
            if (openTicket.status === 'assigned' || openTicket.status === 'technician_enroute') {
                return <TechnicianStartWork ticket={openTicket} product={product} />;
            }
            if (openTicket.status === 'work_in_progress') {
                return <TechnicianCompleteWork ticket={openTicket} product={product} />;
                // Photo upload, parts used, resolution notes, mark complete
            }
            return <TechnicianTicketView ticket={openTicket} />;
            
        case 'service_center_admin':
        case 'manufacturer_admin':
            return <ManagerAssetView product={product} tickets={allTickets} />;
            // Full history, analytics, cost tracking
            
        default:
            return <CustomerProductView product={product} />;
    }
}
```

### 5.2 Warranty Activation Flow (First Customer Scan)

When a customer scans a QR/taps NFC for the first time on a product with `warranty_status = 'pending_activation'`:

```
1. Show product details (pre-filled from bulk allocation):
   - Product model name and image
   - Manufacturer name
   - Product serial number
   - Warranty duration (e.g., "1 Year Manufacturer Warranty")

2. Capture customer details (simple form):
   - Name (required)
   - Phone number (required) — send OTP for verification
   - Email (optional)
   - Address (optional, can be added later)
   - Installation date (default: today)

3. On submit:
   - Set product.warranty_start_date = NOW()
   - Calculate product.warranty_end_date = NOW() + warranty_duration_months
   - Set product.warranty_status = 'active'
   - Set product.customer_name, customer_phone, etc.
   - Create user record if not exists (role: customer)
   - Send confirmation SMS (mode-aware): "Your [Product Name] warranty is now active until [date]. Tap/scan your sticker anytime for service: [link]."
   
4. Show confirmation:
   - "Warranty Activated!"
   - Warranty certificate (downloadable PDF)
   - "Bookmark this page for future service requests"
```

---

## 6. KEY FEATURES BY ROLE

### 6.1 Manufacturer Admin Dashboard

```
/dashboard/manufacturer
├── Overview
│   ├── Total products under warranty (active/expired)
│   ├── Open service tickets (by status)
│   ├── Pending warranty claims
│   ├── Monthly warranty cost trend (Recharts)
│   └── Top issues by product model
│
├── Products
│   ├── Product Models catalog (CRUD)
│   ├── Active products list (searchable, filterable)
│   └── Warranty expiry calendar
│
├── Sticker Management
│   ├── Bulk Allocation tool
│   │   ├── Enter sticker range (start - end)
│   │   ├── Select product model
│   │   ├── Enter appliance serial range
│   │   ├── One-click bind
│   │   └── Allocation history log
│   └── Sticker inventory (allocated/bound/activated/available)
│
├── Service Network
│   ├── Authorized service centers list
│   ├── Authorize new service center
│   ├── Performance scorecards (resolution time, rating, claim accuracy)
│   └── Coverage map (show service center locations + radius)
│
├── Warranty Claims
│   ├── Pending review queue
│   ├── Claim detail view (auto-generated documentation)
│   ├── Approve / Reject with notes
│   ├── Payment tracking
│   └── Claims analytics (approval rate, avg amount, monthly spend)
│
├── Analytics
│   ├── Product reliability (failure rates by model)
│   ├── Common issues heatmap
│   ├── Regional performance
│   ├── Technician performance
│   └── Customer satisfaction scores
│
└── Settings
    ├── Organization profile
    ├── SLA configuration (response time, resolution time by severity)
    ├── Notification preferences
    ├── API keys (for ERP integration)
    └── Team members (invite/manage)
```

### 6.2 Service Center Dashboard

```
/dashboard/service-center
├── Overview
│   ├── Active tickets assigned to this center
│   ├── Technician availability
│   ├── Pending claims (submitted / approved / paid)
│   └── Performance metrics (avg resolution time, rating)
│
├── Tickets
│   ├── Incoming tickets (accept / reject / reassign)
│   ├── Active tickets by technician
│   ├── Completed tickets pending customer confirmation
│   └── Ticket history (searchable)
│
├── Technicians
│   ├── Technician roster (CRUD)
│   ├── Skills matrix
│   ├── Availability calendar
│   ├── Performance by technician
│   └── Workload balancing view
│
├── Claims
│   ├── Auto-generated claims ready for review
│   ├── Submit to manufacturer
│   ├── Track claim status
│   └── Payment reconciliation
│
└── Parts Inventory (optional Phase 2)
    ├── Common parts stock levels
    ├── Parts used per ticket tracking
    └── Reorder alerts
```

### 6.3 Technician Mobile Dashboard

```
/dashboard/technician (optimized for mobile)
├── My Jobs
│   ├── Assigned to me (tap to view details)
│   ├── In progress
│   ├── Pending customer confirmation
│   └── Completed today
│
├── Job Detail View
│   ├── Customer name, phone (tap to call)
│   ├── Product model, serial number
│   ├── Issue description + photos
│   ├── Complete service history of this product
│   ├── Parts likely needed (AI suggestion)
│   ├── Navigation to customer location (Google Maps link)
│   ├── "Start Work" button (or scan sticker)
│   └── "Complete Work" form:
│       ├── Resolution description (text)
│       ├── Photo upload (before/after)
│       ├── Parts used (select from catalog + cost)
│       ├── Labor time
│       └── Submit
│
├── My Schedule
│   └── Calendar view of assigned jobs
│
└── My Performance
    ├── Jobs completed (this week/month)
    ├── Average resolution time
    ├── Customer rating
    └── Earnings / claims generated
```

### 6.4 Customer Portal

```
/dashboard/customer (or accessible without auth via sticker scan)
├── My Products
│   ├── List of all products registered to this phone number
│   ├── Each product shows:
│   │   ├── Product name + image
│   │   ├── Warranty status (active/expired) with countdown
│   │   ├── Service history
│   │   └── QR code (for re-scanning)
│   └── "Register Another Product" (enter sticker number manually)
│
├── My Tickets
│   ├── Open tickets with live status
│   ├── Closed tickets history
│   └── Ticket detail:
│       ├── Timeline (every event from report to resolution)
│       ├── Assigned technician name + phone
│       ├── ETA
│       └── Confirm Resolution button
│
└── Support
    ├── Contact manufacturer
    ├── Warranty certificate download (PDF)
    └── FAQ
```

---

## 7. API ROUTES

### 7.1 Public APIs (No Auth)

```
POST   /api/sticker/lookup          — Look up sticker by number, return product + status
POST   /api/warranty/activate       — Activate warranty (first scan)
POST   /api/ticket/create           — Create service request (customer scan)
GET    /api/ticket/[id]/status      — Check ticket status (for tracking page)
POST   /api/ticket/[id]/confirm     — Customer confirms resolution
```

### 7.2 Technician APIs (Auth: technician role)

```
GET    /api/technician/jobs         — My assigned jobs
POST   /api/ticket/[id]/start       — Mark work started (technician scan)
POST   /api/ticket/[id]/complete    — Mark work complete + upload docs
POST   /api/upload/photo            — Upload photo (returns URL)
```

### 7.3 Service Center APIs (Auth: service_center_admin)

```
GET    /api/service-center/tickets          — All tickets for this center
POST   /api/service-center/technician       — CRUD technicians
POST   /api/ticket/[id]/assign              — Manually assign technician
GET    /api/service-center/claims           — Claims list
POST   /api/claim/[id]/submit               — Submit claim to manufacturer
```

### 7.4 Manufacturer APIs (Auth: manufacturer_admin)

```
POST   /api/manufacturer/product-model      — CRUD product models
POST   /api/manufacturer/allocate           — Bulk sticker allocation
GET    /api/manufacturer/stickers/generate-qr            — QR asset exports (CSV / PNG ZIP / PDF sheet)
GET    /api/manufacturer/stickers/generate-nfc-encoding  — NFC encoding exports (CSV / JSON)
GET    /api/manufacturer/products            — All products under warranty
GET    /api/manufacturer/claims              — Claims for review
POST   /api/claim/[id]/approve              — Approve claim
POST   /api/claim/[id]/reject               — Reject claim
GET    /api/manufacturer/analytics           — Dashboard analytics
POST   /api/manufacturer/service-center/authorize — Authorize a service center
```

### 7.5 Internal APIs (Auth: super_admin)

```
POST   /api/admin/stickers/generate         — Generate sticker number range
GET    /api/admin/organizations              — Manage organizations
GET    /api/admin/platform-analytics         — Platform-wide metrics
```

---

## 8. AI-POWERED TECHNICIAN ASSIGNMENT

When a service ticket is created, the AI assignment engine runs:

```typescript
async function assignTechnician(ticket: Ticket, product: Product): Promise<Assignment> {
    
    // 1. Find service centers authorized for this manufacturer
    const authorizedCenters = await findAuthorizedServiceCenters(
        product.organization_id,
        product.product_model.category
    );
    
    // 2. Filter by proximity to customer location
    const nearbyCenters = filterByDistance(
        authorizedCenters,
        product.customer_location || product.customer_pincode,
        maxRadiusKm: 50
    );
    
    // 3. Find available technicians with matching skills
    const availableTechnicians = await findAvailableTechnicians(
        nearbyCenters,
        product.product_model.required_skills,
        maxConcurrentJobs: 3
    );
    
    // 4. Score and rank technicians
    const scored = availableTechnicians.map(tech => ({
        technician: tech,
        score: calculateScore({
            distance: distanceTo(tech.current_location, product.customer_location), // 40% weight
            rating: tech.rating,                    // 25% weight
            workload: tech.active_job_count,         // 20% weight
            skillMatch: matchSkills(tech.skills, product.product_model.required_skills), // 15% weight
        })
    }));
    
    // 5. Assign top-scored technician
    const bestMatch = scored.sort((a, b) => b.score - a.score)[0];
    
    // 6. If no match found, escalate
    if (!bestMatch) {
        return escalateToManualAssignment(ticket);
    }
    
    return assignToTechnician(ticket, bestMatch.technician);
}
```

---

## 9. NOTIFICATION FLOWS

| Event | Recipient | Channel | Message |
|---|---|---|---|
| Warranty activated | Customer | SMS | "Your [Product] warranty is active until [date]. Tap/scan your sticker anytime for service: [link]." (mode-aware) |
| Ticket created | Technician | SMS + Push + WhatsApp | "New job: [Issue] at [Location]. Product: [Model]. Accept?" |
| Ticket created | Service Center | Email + Dashboard | "New ticket [#] assigned to [Technician]" |
| Technician en route | Customer | SMS | "[Technician] is on the way. ETA: [time]. Call: [phone]" |
| Work started | Customer | SMS | "Service has begun on your [Product]." |
| Work completed | Customer | SMS + WhatsApp | "Service complete! Confirm resolution: [link]" |
| Customer confirmed | Technician | Push | "Customer confirmed resolution for ticket [#]. Well done!" |
| Customer confirmed | Service Center | Dashboard | Claim auto-generated and ready for review |
| Claim submitted | Manufacturer | Email + Dashboard | "New warranty claim [#] from [Service Center]. Amount: ₹[X]" |
| Claim approved | Service Center | Email + SMS | "Claim [#] approved. Amount: ₹[X]. Payment in [Y] days." |
| Claim rejected | Service Center | Email + SMS | "Claim [#] rejected. Reason: [reason]." |
| SLA breach | Service Center + Manufacturer | Email + SMS | "Ticket [#] has breached SLA. Escalation triggered." |
| Warranty expiring | Customer | SMS | "Your [Product] warranty expires in 30 days. Consider extended warranty." |

---

## 10. BUILD PHASES

### Phase 1 — Core MVP (Weeks 1-4)

**Goal:** One manufacturer can bulk-allocate stickers, customers can activate warranty and submit service requests, technicians can complete work, claims are auto-generated.

- [ ] Clone asset.feedbacknfc.com codebase
- [ ] Set up warranty.feedbacknfc.com on Vercel
- [ ] Database schema migration (all core tables)
- [ ] Clerk authentication with role-based access
- [ ] Smart sticker route `/nfc/[id]` with full context-aware logic
- [ ] Warranty activation flow (first customer scan)
- [ ] Service request creation (customer scan)
- [ ] Technician work start/complete flow (technician scan)
- [ ] Customer confirmation flow (customer scan)
- [ ] Basic manufacturer dashboard (products, stickers, allocation)
- [ ] Basic technician mobile dashboard (my jobs, complete work)
- [ ] SMS notifications (Twilio) for key events
- [ ] Warranty claim auto-generation

### Phase 2 — Full Dashboards (Weeks 5-8)

- [ ] Complete manufacturer dashboard with analytics
- [ ] Service center dashboard
- [ ] Customer portal (my products, my tickets)
- [ ] Claim approval/rejection workflow
- [ ] SLA tracking and escalation engine
- [ ] AI technician assignment (scoring algorithm)
- [ ] PDF generation (warranty certificate, claim report)
- [ ] Email notifications (Resend)
- [ ] Multi-language support (Hindi, Tamil, Kannada, Telugu)

### Phase 3 — Intelligence & Scale (Weeks 9-12)

- [ ] Advanced analytics (product reliability, failure heatmaps)
- [ ] WhatsApp Business API integration for notifications
- [ ] Parts inventory management for service centers
- [ ] Extended warranty purchase flow (Razorpay integration)
- [ ] API documentation for ERP integration
- [ ] Coverage map visualization (service center locations)
- [ ] Bulk CSV import for sticker allocation
- [ ] Customer satisfaction surveys post-resolution
- [ ] Mobile PWA optimization

### Phase 4 — Enterprise Features (Weeks 13+)

- [ ] Multi-manufacturer support (platform as marketplace)
- [ ] Distributor role and dashboard
- [ ] Retailer role and dashboard
- [ ] White-label option for large manufacturers
- [ ] Webhook integrations (ERP, CRM, accounting)
- [ ] Advanced AI: predictive maintenance alerts based on ticket patterns
- [ ] Customer self-service: troubleshooting guides before creating ticket
- [ ] Payment processing for claim settlements

---

## 11. IMPORTANT IMPLEMENTATION NOTES

### 11.1 Sticker Route Must Be FAST
The `/nfc/[id]` page is the first thing a customer sees after scanning. It must load in under 2 seconds on a 3G connection. Use server-side rendering (SSR) for the initial sticker lookup and product data. Keep the page lightweight — no heavy JS frameworks on this route.

### 11.2 Offline Considerations
Technicians in the field may have poor connectivity. The technician's "Complete Work" form should:
- Allow photo capture offline (store in browser)
- Queue form submission if offline
- Sync when connection is restored

### 11.3 Phone Number as Primary Customer Identity
Most Indian customers won't create accounts. Use phone number (with OTP verification) as the primary identifier. When a customer scans a sticker, if they have a matching phone number in the system, auto-associate them with their existing products.

### 11.4 Preserve Landing Page
The existing warranty.feedbacknfc.com landing page should remain as the public `/` route. Authenticated users get redirected to `/dashboard`. The landing page's "Request Demo" and "Apply for Pilot" forms should create leads in the database.

### 11.5 Shared NFC Route Resolution
The `feedbacknfc.com/nfc/[id]` route must determine whether to redirect to the asset platform or the warranty platform. Options:
- **Option A:** Number range based — stickers 1-50000 go to asset, 50001+ go to warranty
- **Option B:** Database lookup at the parent domain level
- **Option C:** All go to warranty platform, which checks and redirects to asset if needed

Recommend **Option A** for simplicity during the initial build.

### 11.6 QR-First India Design
All customer-facing interfaces should assume QR scan entry (not NFC tap). Design for:
- Mobile-first responsive layouts
- Fast page load (minimize JS bundle)
- Large touch targets
- Regional language support
- Works on budget Android smartphones (Chrome)

---

## 12. REFERENCE: EXISTING ASSET PLATFORM PATTERNS TO REUSE

From asset.feedbacknfc.com, directly copy and adapt:

| Component | Asset Platform | Warranty Adaptation |
|---|---|---|
| Authentication | Clerk with org management | Add manufacturer, service_center, customer roles |
| NFC route logic | `/nfc/[id]` → context switch | Same pattern, extended states (warranty activation, claim) |
| Ticket lifecycle | created → assigned → in_progress → completed → confirmed | Same + add claim generation step |
| Technician dashboard | Mobile-optimized job list | Same UX, add parts tracking + claim documentation |
| Admin dashboard | Single org management | Multi-org (manufacturer sees their products across service centers) |
| Notification system | SMS/email on status change | Same + WhatsApp, add warranty-specific messages |
| Photo upload | Ticket attachments | Same + use for claim evidence |
| AI assignment | Skill + location matching | Same algorithm, add manufacturer authorization filter |
| Timeline/audit | Ticket event log | Same pattern |

---

## 13. UX/UI DESIGN SPECIFICATION — MATCH ASSET PLATFORM

### 13.1 Critical Requirement

**The warranty platform must be visually identical to asset.feedbacknfc.com in design language, layout patterns, component styling, and interaction behavior.** A user familiar with the asset platform should feel immediately at home on the warranty platform. The only differences should be content, terminology, and warranty-specific features — not design.

### 13.2 How to Implement

**Step 1: Clone the complete frontend** from asset.feedbacknfc.com including all global styles, theme configuration, layout components, and shared UI components. Do not start from a blank Next.js template.

**Step 2: Replicate these exact patterns from the asset platform:**

| Element | What to Copy Exactly |
|---|---|
| Color palette | Primary, secondary, accent, background, surface, and text colors from the asset platform's Tailwind config / CSS variables |
| Typography | Font family, sizes, weights, line heights — copy the Tailwind typography config exactly |
| Sidebar navigation | Same layout structure, icon style (Lucide), active state styling, collapse behavior |
| Top header bar | Same height, background, user avatar position, notification bell placement |
| Card components | Same border radius, shadow depth, padding, hover states used for dashboard cards |
| Data tables | Same table component styling — header background, row hover, pagination controls |
| Form inputs | Same input field height, border color, focus ring, label positioning, error state styling |
| Buttons | Same button variants (primary, secondary, outline, ghost, destructive) — sizes, padding, border radius |
| Modal dialogs | Same overlay opacity, modal width, header/body/footer structure |
| Toast notifications | Same position (top-right or bottom-right), animation, success/error/info color coding |
| Status badges | Same pill-shaped badges with color coding for statuses |
| Loading states | Same skeleton loaders or spinner components |
| Empty states | Same illustration style and messaging pattern for empty data views |
| Mobile responsive breakpoints | Same breakpoint values and responsive behavior |
| Page transition animations | Same page load and route change animations if any |

### 13.3 Theme Configuration

Copy the asset platform's Tailwind configuration exactly. If it uses CSS custom properties (CSS variables), copy those. If it uses a shadcn/ui theme, copy the theme file. Specifically:

```
Copy these files from asset.feedbacknfc.com:
├── tailwind.config.ts          — Complete Tailwind config with theme extensions
├── src/app/globals.css         — Global styles, CSS variables, font imports
├── src/lib/utils.ts            — Utility functions (cn(), etc.)
├── src/components/ui/          — ALL shadcn/ui components (button, card, input, table, dialog, etc.)
├── src/components/layout/      — Sidebar, Header, PageWrapper, DashboardLayout
├── src/components/shared/      — StatusBadge, DataTable, EmptyState, LoadingSpinner, etc.
└── public/fonts/               — Any custom fonts
```

### 13.4 Layout Structure to Replicate

**Dashboard layout** (authenticated pages):
```
┌──────────────────────────────────────────────────────┐
│  Top Header Bar (logo, search, notifications, avatar) │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │         Main Content Area                 │
│ Nav      │                                           │
│          │  ┌─────────────────────────────────────┐  │
│ • Home   │  │  Page Title + Breadcrumb            │  │
│ • Tickets│  ├─────────────────────────────────────┤  │
│ • Assets │  │                                     │  │
│ • Claims │  │  Content (cards, tables, forms)     │  │
│ • Reports│  │                                     │  │
│ • Team   │  │                                     │  │
│ • Config │  │                                     │  │
│          │  └─────────────────────────────────────┘  │
│          │                                           │
├──────────┴───────────────────────────────────────────┤
│  (Sidebar collapses to icons on mobile)              │
└──────────────────────────────────────────────────────┘
```

**Public sticker page** (`/nfc/[id]` — mobile-first):
```
┌─────────────────────┐
│ FeedbackNFC Logo    │  ← Same header bar as asset platform's public NFC page
├─────────────────────┤
│                     │
│  Product Image      │
│                     │
│  Product Name       │
│  Model: XYZ-123     │
│  Serial: ABC-456    │
│                     │
│  ┌───────────────┐  │
│  │ Warranty:     │  │
│  │ Active ✓      │  │  ← Use same StatusBadge component
│  │ Until Dec 2027│  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Report Issue  │  │  ← Same primary button style
│  └───────────────┘  │
│                     │
│  Service History    │
│  ├─ 12 Jan: Fixed   │  ← Same timeline component from asset platform
│  └─ 03 Mar: Checked │
│                     │
└─────────────────────┘
```

### 13.5 Warranty-Specific UI Additions

These are NEW components not in the asset platform, but they must use the same design tokens and component patterns:

**Warranty Status Card** — Use the same card component as the asset platform's asset info card, but add:
- Warranty countdown (days remaining) with a circular progress indicator
- Status color coding: Green (active, >90 days), Yellow (active, <90 days), Orange (active, <30 days), Red (expired)
- Warranty certificate download link

**Bulk Allocation Wizard** — Use the same multi-step form pattern if it exists in the asset platform, or use a shadcn/ui stepper:
- Step 1: Select sticker range (start/end number inputs)
- Step 2: Select product model (dropdown from catalog)
- Step 3: Enter appliance serial range
- Step 4: Review and confirm
- Step 5: Success confirmation with allocation summary

**Warranty Claim Card** — For the claims queue in manufacturer/service center dashboards:
- Ticket reference + product details
- Claim amount (prominent)
- Auto-generated documentation thumbnail (photos)
- Approve / Reject action buttons (same button styling)
- Status badge (same component, new statuses: submitted, under_review, approved, rejected, paid)

**Customer Activation Screen** — This is the first impression for end customers. It must be:
- Clean, minimal, and fast-loading
- Product image prominent
- Simple form (name, phone, OTP)
- Large "Activate Warranty" button
- Confirmation animation (same style as asset platform's success states)
- Use the same color palette — do not create a separate "customer theme"

### 13.6 Navigation Items by Role

Sidebar navigation items change based on user role, but the sidebar component itself is identical:

**Manufacturer Admin:**
- Dashboard (overview)
- Products (product models catalog)
- Stickers (allocation, inventory)
- Tickets (all service requests)
- Service Network (authorized centers)
- Claims (review + approve)
- Analytics
- Settings

**Service Center Admin:**
- Dashboard (overview)
- Tickets (incoming, active, completed)
- Technicians (roster, performance)
- Claims (generate, submit, track)
- Settings

**Technician:**
- My Jobs (assigned, in progress, completed)
- Schedule (calendar view)
- My Performance
- Settings

**Customer:**
- My Products (registered products list)
- My Tickets (service requests)
- Support
- Settings

### 13.7 Branding

- **Logo:** Use the existing FeedbackNFC logo — same as the asset platform
- **Favicon:** Same as asset platform
- **App name in header:** "FeedbackNFC | Warranty" (to differentiate from "FeedbackNFC | Assets")
- **Page titles:** Follow asset platform's pattern, e.g., "Dashboard — FeedbackNFC Warranty"

### 13.8 What NOT to Change

Do not introduce:
- New fonts or font sizes not in the asset platform
- New color values not in the existing palette
- Different border radius values
- Different shadow depths
- New animation libraries or transition styles
- A different icon set (stay with Lucide React)
- Different spacing scale (stay with the existing Tailwind spacing)
- Different responsive breakpoints

**If in doubt about any design decision, refer to asset.feedbacknfc.com as the single source of truth.**

---

*End of base specification. See Appendix A for addenda that keep this document aligned with the current implementation.*

---

## Appendix A — Sticker Mode Configuration (Spec Addendum)

**Feature:** Manufacturer-configurable sticker mode (QR Only / NFC + QR / NFC Only)  
**Scope:** Manufacturer settings, sticker allocation wizard, sticker production tools, customer-facing copy, analytics attribution  
**Dependencies:** Existing sticker management (GAP 1), existing manufacturer settings (GAP 9)

### A1. Concept

Each manufacturer organization chooses a sticker technology mode as a platform setting. This choice affects:

- What `stickers.type` is stamped during allocation
- Which sticker production tools are available in the Sticker Management dashboard
- What print-ready assets are generated for sticker production
- What instructions/labels appear in the allocation wizard

This choice does **not** affect:

- The `/nfc/[id]` route logic (same route for all modes; only copy/attribution changes)
- Ticket/claim workflows
- The user experience after reaching the sticker page (customer/technician/manager views remain role-driven)

### A2. Data Model

#### A2.1 Organization Settings Extension (JSONB)

Extend `organizations.settings` with:

```json
{
  "sticker_mode": "qr_only",
  "sticker_branding": {
    "primary_color": "#0066CC",
    "logo_url": "https://...",
    "instruction_text_en": "Scan for Warranty Service",
    "instruction_text_hi": "वारंटी सेवा के लिए स्कैन करें",
    "instruction_text_ar": "امسح للحصول على خدمة الضمان",
    "regional_language": "hi",
    "show_support_phone": true,
    "support_phone": "+91 7899910288"
  },
  "sticker_url_base": "warranty.feedbacknfc.com"
}
```

Notes:
- `sticker_url_base` is stored/used as a host (no scheme). Inputs like `https://warranty.feedbacknfc.com` are normalized to `warranty.feedbacknfc.com`.
- Branding fields are stored snake_case as shown above.

#### A2.2 Stickers Table / Enum

`stickers.type` represents the sticker technology mode. Supported values:

- `qr_only`
- `nfc_qr`
- `nfc_only`

`stickers.variant` remains independent and describes the physical material (`standard`, `high_temp`, `premium`).

Migration reference:
- `prisma/migrations/20260305193000_add_nfc_only_sticker_type/migration.sql`

#### A2.3 Sticker Scan Events (Analytics)

For scan frequency + “top scanned stickers” analytics, store scan events:

- Table: `sticker_scan_events`
- Enum: `StickerScanSource = qr | nfc | unknown`

Migration reference:
- `prisma/migrations/20260305194500_add_sticker_scan_events/migration.sql`

Additionally, warranty activation stores `activationSource` in `products.metadata` as `qr | nfc | unknown` when the activation form is submitted.

### A3. Manufacturer Settings UI

Add a new **Sticker Configuration** section to:

- `/dashboard/manufacturer/settings`

This section includes:

1) **Sticker Technology Mode**
- QR Code Only
- NFC + QR Code (recommended)
- NFC Only

2) **Sticker Branding**
- Brand color (hex)
- Logo URL
- Instruction text (English + regional language)
- Regional language selector (`hi` / `ar`)
- Support phone toggle + phone value
- Sticker URL base (`warranty.feedbacknfc.com` by default)

Behavior:
- Changing sticker mode affects **future allocations only**.
- Existing allocated/bound/activated stickers keep their stamped `stickers.type`.

### A4. Allocation Wizard Adaptation

The existing allocation wizard remains a 5-step flow. Step 1 adapts based on `organizations.settings.sticker_mode`:

- **QR Only**
  - Technology label: “QR Code Only”
  - Material variants: `standard`, `high_temp`

- **NFC + QR**
  - Technology label: “NFC + QR Code”
  - Material variants: `premium` (fixed)
  - Show warning: NFC stickers require encoding export after allocation

- **NFC Only**
  - Technology label: “NFC Only (no QR printed)”
  - Material variants: `standard` (fixed)
  - Show warning: NFC stickers require encoding export after allocation

Allocation backend behavior:
- Allocation stamps `stickers.type` and `stickers.variant` for all stickers in the allocated range at allocation time.

### A5. Sticker Production Tools

Add a “Production Tools” section to the manufacturer Stickers page:

- `/dashboard/manufacturer/stickers`

#### A5.1 Generate Print-Ready QR Codes (QR Only + NFC + QR)

API:
- `GET /api/manufacturer/stickers/generate-qr`

Query params:
- `allocation_id` — allocation UUID
- `format` — `pdf_sheet` | `png_zip` | `csv`
- `qr_size_mm` — `25` | `30` | `35`
- `error_correction` — `L` | `M` | `Q` | `H`

Outputs:
- `csv`: `sticker_number,serial,url` where the URL is:
  - `https://{sticker_url_base}/nfc/{stickerNumber}?src=qr`
- `png_zip`: individual PNG QR codes named `{serial}.png`
- `pdf_sheet`: multi-page A4 PDF with a simple sticker grid including branding + serial + QR

#### A5.2 Generate NFC Encoding File (NFC + QR + NFC Only)

API:
- `GET /api/manufacturer/stickers/generate-nfc-encoding`

Query params:
- `allocation_id` — allocation UUID
- `format` — `ndef_uri_csv` | `nfc_tools_json`

Outputs:
- `ndef_uri_csv`: `sticker_number,serial,ndef_uri` where the URI is:
  - `https://{sticker_url_base}/nfc/{stickerNumber}?src=nfc`
- `nfc_tools_json`: JSON export with the same payload for generic tooling.

### A6. Customer-Facing Differences by Mode

#### A6.1 Sticker Not Registered / Not Bound Copy

When a sticker is allocated but not yet bound to a product, copy adapts by `stickers.type`:

- **QR Only:** “This QR sticker is not registered…”
- **NFC + QR:** “Try tapping or scanning again…”
- **NFC Only:** “Please tap again…”

If a sticker number does not exist in the DB (truly unknown), default to generic copy.

#### A6.2 Warranty Certificate Wording

The warranty certificate PDF includes mode-aware access instructions:

- **QR Only:** “Scan the QR code below…”
- **NFC + QR:** “Tap or scan the sticker…”
- **NFC Only:** “Tap the NFC sticker…”

#### A6.3 Customer SMS Templates (Warranty Activated)

Warranty activation confirmation SMS uses mode-aware wording and includes a direct service link:

- QR Only: “Scan the QR sticker…”
- NFC + QR: “Tap or scan the sticker…”
- NFC Only: “Tap the NFC sticker…”

### A7. Analytics Extension

Add to manufacturer analytics:

- **Activation source breakdown**: counts of activations by `products.metadata.activationSource`
- **Top scanned stickers**: scan counts from `sticker_scan_events` over the last 30 days

### A8. Defaults (New Manufacturer Organizations)

Defaults for new manufacturers:

- `sticker_mode`: `qr_only`
- `sticker_branding.primary_color`: `#0066CC`
- `sticker_branding.regional_language`: `hi`
- `sticker_branding.show_support_phone`: `true`
- `sticker_url_base`: `warranty.feedbacknfc.com`
- QR defaults (for production tooling): size `30mm`, error correction `H`

### A9. Implementation References (for Sync)

Key implementation entry points:

- Settings schema + normalization: `src/lib/sticker-config.ts`
- Manufacturer settings API: `src/app/api/manufacturer/settings/route.ts`
- Settings UI: `src/components/manufacturer/settings-client.tsx`
- Allocation API stamping `type`/`variant`: `src/app/api/manufacturer/allocate/route.ts`
- Allocation wizard + production tools UI: `src/components/manufacturer/sticker-wizard-client.tsx`
- QR generation API: `src/app/api/manufacturer/stickers/generate-qr/route.ts`
- NFC encoding export API: `src/app/api/manufacturer/stickers/generate-nfc-encoding/route.ts`
- PDF sheet renderer: `src/lib/pdf/sticker-sheet-document.tsx`
- Scan tracking (`?src=qr|nfc` + scan events): `src/app/nfc/[id]/page.tsx`
- Activation source capture: `src/app/api/warranty/activate/route.ts`
- Manufacturer analytics panels: `src/app/(dashboard)/dashboard/manufacturer/analytics/page.tsx`
