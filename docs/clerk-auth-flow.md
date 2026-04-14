# Clerk Auth Flow (Local + Production Validation)

This project already includes Clerk integration in these paths:

- `src/app/layout.tsx` uses `ClerkProvider`
- `src/middleware.ts` protects `/dashboard/*`
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`

## 1) Configure Clerk app and env vars

1. Create an application in Clerk.
2. In Clerk dashboard, add redirect URLs:
   - `http://localhost:3000/sign-in`
   - `http://localhost:3000/sign-up`
   - `http://localhost:3000/dashboard`
3. Copy keys into `.env`:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. Ensure these are present:
   - `CLERK_SIGN_IN_URL=/sign-in`
   - `CLERK_SIGN_UP_URL=/sign-up`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard`

Then run:

```bash
npm run dev
```

## 2) Basic auth test

1. Open `http://localhost:3000/sign-in` and use the sign-up link, or open `http://localhost:3000/sign-up` directly.
2. After sign-up, the app redirects to `/dashboard`.
3. Open `http://localhost:3000/dashboard` while signed out to confirm redirect to sign-in.

Expected redirect behavior after sign-in:

- `manufacturer_admin` → `/dashboard/manufacturer`
- `customer` → `/dashboard/customer`
- other roles → `/dashboard` (role-specific navigation cards)

## 3) Role-based testing (all dashboards/features)

In **development mode**, open `/dashboard` and use the **Development Role Switcher**.

- It updates Clerk user metadata role via `POST /api/dev/role`.
- Available roles:
  - `super_admin`
  - `manufacturer_admin`
  - `service_center_admin`
  - `technician`
  - `customer`

If role-based nav does not update immediately, sign out and sign in again once.

## 3.1) Create DB rows for Clerk users (role sync)

If a Clerk user exists but role access is broken, run:

```bash
npm run bootstrap:clerk-users
```

This syncs missing `users` table rows for existing Clerk users.

## 4) Manufacturer feature routes to validate

After setting role to `manufacturer_admin`, verify:

- `/dashboard/manufacturer`
- `/dashboard/manufacturer/products`
- `/dashboard/manufacturer/stickers`
- `/dashboard/manufacturer/service-network`
- `/dashboard/manufacturer/claims`

## 4.1) Customer routes to validate (Batch 3)

After setting role to `customer`, verify:

- `/dashboard/customer`
- `/dashboard/my-products`
- `/dashboard/my-tickets`
- `/dashboard/support`
- `/nfc/100?lang=en` and `/nfc/100?lang=hi`

## 5) Notes

- The dev role switch endpoint is blocked outside development.
- Manufacturer pages include an additional role gate (`manufacturer_admin`).
- If you need to temporarily bypass manufacturer role guard during UI work, set:

```bash
NEXT_PUBLIC_DISABLE_ROLE_GUARD=true
```

Do not use that bypass in production.

Production sanity checks (for “wrong app name” or “user not found” issues):

- Confirm production domain uses production Clerk keys
- Confirm created users exist in the same Clerk instance (dev/prod mismatch is the most common root cause)
- If sign-in title shows another app name, update Clerk app branding for the active instance

## 6) Vercel environment key split (recommended)

Use different Clerk keys per Vercel environment:

- `Development` and `Preview`: test keys (`pk_test_*`, `sk_test_*`)
- `Production`: live keys (`pk_live_*`, `sk_live_*`)

Example commands:

```bash
# Preview -> test keys
echo "pk_test_xxx" | vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY preview --force
echo "sk_test_xxx" | vercel env add CLERK_SECRET_KEY preview --force

# Development -> test keys
echo "pk_test_xxx" | vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY development --force
echo "sk_test_xxx" | vercel env add CLERK_SECRET_KEY development --force

# Production -> live keys
echo "pk_live_xxx" | vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production --force
echo "sk_live_xxx" | vercel env add CLERK_SECRET_KEY production --force
```

After changing environment variables, create a new deployment so updated values are used.
