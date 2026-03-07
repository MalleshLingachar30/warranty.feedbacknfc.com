# ADE Prompt — Progressive Web App (PWA) Implementation

Read WARRANTY-SPEC.md for overall project context. This task converts the warranty platform into an installable PWA optimized for technician field use on Android devices, with offline capabilities and photo queuing.

**Goal:** Any user (especially technicians) can "Add to Home Screen" and use the warranty platform like a native app — with offline shell loading, photo capture queuing when offline, and push notification support.

---

## PART 1: PWA MANIFEST AND ICONS

### 1.1 Create `public/manifest.json`

```json
{
  "name": "FeedbackNFC Warranty",
  "short_name": "Warranty",
  "description": "Warranty lifecycle management — activate, service, resolve",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#0066CC",
  "categories": ["business", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/dashboard-mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Technician Dashboard"
    }
  ],
  "shortcuts": [
    {
      "name": "My Jobs",
      "short_name": "Jobs",
      "url": "/dashboard/my-jobs",
      "icons": [{ "src": "/icons/shortcut-jobs.png", "sizes": "96x96" }]
    },
    {
      "name": "Scan Sticker",
      "short_name": "Scan",
      "url": "/nfc/scan",
      "icons": [{ "src": "/icons/shortcut-scan.png", "sizes": "96x96" }]
    }
  ]
}
```

### 1.2 Generate PWA Icons

Create a set of PWA icons from the existing FeedbackNFC logo. Place in `public/icons/`. Use the existing brand colors (match the asset platform's icon style). Generate all sizes listed in the manifest. The 192x192 and 512x512 icons must support the `maskable` purpose (safe zone for adaptive icons on Android).

### 1.3 Add Meta Tags to Root Layout

In `src/app/layout.tsx`, add inside `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0066CC" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="FeedbackNFC Warranty" />
<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
```

---

## PART 2: SERVICE WORKER

### 2.1 Install next-pwa

```bash
npm install next-pwa
```

### 2.2 Configure next.config.js

```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Cache app shell (HTML pages)
    {
      urlPattern: /^https:\/\/warranty\.feedbacknfc\.com\/dashboard/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'dashboard-pages',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        },
        networkTimeoutSeconds: 5
      }
    },
    // Cache sticker route pages
    {
      urlPattern: /^https:\/\/warranty\.feedbacknfc\.com\/nfc\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'sticker-pages',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 // 1 hour
        },
        networkTimeoutSeconds: 3
      }
    },
    // Cache static assets (JS, CSS, images)
    {
      urlPattern: /^https:\/\/warranty\.feedbacknfc\.com\/_next\/static/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
        }
      }
    },
    // Cache fonts
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    },
    // Cache API responses (short TTL)
    {
      urlPattern: /^https:\/\/warranty\.feedbacknfc\.com\/api\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-responses',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 5 * 60 // 5 minutes
        },
        networkTimeoutSeconds: 5
      }
    }
  ]
});

module.exports = withPWA({
  // ... existing next.config.js settings
});
```

### 2.3 Caching Strategy Explanation

- **Dashboard pages (NetworkFirst):** Try network first, fall back to cache if offline. This means technicians see their latest job list when online, but still see the last-loaded page when offline.
- **Sticker pages (NetworkFirst):** Same strategy. A technician scanning a sticker in a basement with poor signal gets the cached version while the fresh data loads.
- **Static assets (CacheFirst):** JS bundles, CSS, and images are versioned by Next.js, so cache-first is safe and fast.
- **API responses (NetworkFirst, 5-min cache):** API data is always fetched fresh when online, but cached responses serve as fallback when offline for up to 5 minutes.

---

## PART 3: OFFLINE PHOTO QUEUING

This is the most critical offline feature. Technicians often work in basements, server rooms, or rural areas with poor connectivity. They must be able to capture photos even when offline.

### 3.1 Create Photo Queue Module

Create `src/lib/photo-queue.ts`:

```typescript
import { openDB, DBSchema } from 'idb';

// Install idb: npm install idb

interface PhotoQueueDB extends DBSchema {
  'pending-photos': {
    key: string;
    value: {
      id: string;                    // UUID
      ticketId: string;
      photoType: 'issue' | 'before' | 'after' | 'resolution';
      blob: Blob;                    // the actual photo data
      filename: string;
      capturedAt: string;            // ISO timestamp
      uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
      uploadAttempts: number;
      lastAttemptAt: string | null;
      uploadedUrl: string | null;    // URL after successful upload
    };
    indexes: {
      'by-ticket': string;
      'by-status': string;
    };
  };
}

const DB_NAME = 'warranty-photo-queue';
const DB_VERSION = 1;

async function getDB() {
  return openDB<PhotoQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('pending-photos', { keyPath: 'id' });
      store.createIndex('by-ticket', 'ticketId');
      store.createIndex('by-status', 'uploadStatus');
    }
  });
}

// Add a photo to the offline queue
export async function queuePhoto(
  ticketId: string,
  photoType: 'issue' | 'before' | 'after' | 'resolution',
  blob: Blob,
  filename: string
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  await db.put('pending-photos', {
    id,
    ticketId,
    photoType,
    blob,
    filename,
    capturedAt: new Date().toISOString(),
    uploadStatus: 'pending',
    uploadAttempts: 0,
    lastAttemptAt: null,
    uploadedUrl: null
  });
  return id;
}

// Get all pending photos for a ticket
export async function getPendingPhotos(ticketId: string) {
  const db = await getDB();
  return db.getAllFromIndex('pending-photos', 'by-ticket', ticketId);
}

// Get all photos waiting to upload
export async function getUploadQueue() {
  const db = await getDB();
  return db.getAllFromIndex('pending-photos', 'by-status', 'pending');
}

// Process the upload queue (call when online)
export async function processUploadQueue(): Promise<number> {
  const db = await getDB();
  const pending = await db.getAllFromIndex('pending-photos', 'by-status', 'pending');
  let uploaded = 0;

  for (const photo of pending) {
    try {
      // Update status to uploading
      photo.uploadStatus = 'uploading';
      photo.uploadAttempts += 1;
      photo.lastAttemptAt = new Date().toISOString();
      await db.put('pending-photos', photo);

      // Upload to server
      const formData = new FormData();
      formData.append('file', photo.blob, photo.filename);
      formData.append('ticketId', photo.ticketId);
      formData.append('photoType', photo.photoType);

      const response = await fetch('/api/upload/photo', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        photo.uploadStatus = 'uploaded';
        photo.uploadedUrl = result.url;
        await db.put('pending-photos', photo);
        uploaded++;
      } else {
        photo.uploadStatus = photo.uploadAttempts >= 3 ? 'failed' : 'pending';
        await db.put('pending-photos', photo);
      }
    } catch (error) {
      photo.uploadStatus = photo.uploadAttempts >= 3 ? 'failed' : 'pending';
      await db.put('pending-photos', photo);
    }
  }

  return uploaded;
}

// Remove uploaded photos from queue (cleanup)
export async function cleanupUploaded(): Promise<void> {
  const db = await getDB();
  const uploaded = await db.getAllFromIndex('pending-photos', 'by-status', 'uploaded');
  for (const photo of uploaded) {
    await db.delete('pending-photos', photo.id);
  }
}

// Get queue status summary
export async function getQueueStatus(): Promise<{
  pending: number;
  uploading: number;
  uploaded: number;
  failed: number;
}> {
  const db = await getDB();
  const all = await db.getAll('pending-photos');
  return {
    pending: all.filter(p => p.uploadStatus === 'pending').length,
    uploading: all.filter(p => p.uploadStatus === 'uploading').length,
    uploaded: all.filter(p => p.uploadStatus === 'uploaded').length,
    failed: all.filter(p => p.uploadStatus === 'failed').length
  };
}
```

### 3.2 Online/Offline Detection Hook

Create `src/hooks/use-online-status.ts`:

```typescript
import { useState, useEffect } from 'react';
import { processUploadQueue } from '@/lib/photo-queue';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      // Auto-process upload queue when coming back online
      const uploaded = await processUploadQueue();
      if (uploaded > 0) {
        // Show toast notification
        console.log(`${uploaded} photos uploaded from queue`);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

### 3.3 Update Photo Upload Component

The existing photo upload in the technician completion form and customer issue form must be updated to use the queue:

```typescript
// In the photo capture handler:

async function handlePhotoCapture(file: File, photoType: string) {
  if (navigator.onLine) {
    // Online — upload immediately
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/upload/photo', { method: 'POST', body: formData });
    const result = await response.json();
    addPhotoToForm(result.url);
  } else {
    // Offline — queue for later upload
    const queueId = await queuePhoto(ticketId, photoType, file, file.name);
    addPhotoToForm(`queued:${queueId}`); // placeholder reference
    showToast('Photo saved offline. Will upload when connection returns.');
  }
}
```

When the form is submitted with queued photos, the ticket creation/completion API should accept `queued:` references and the backend should resolve them after the upload queue processes. Alternatively, block form submission until all queued photos are uploaded (simpler approach — show "Waiting for photo uploads..." with a progress indicator).

### 3.4 Offline Indicator Banner

Create `src/components/offline-banner.tsx`:

```typescript
'use client';

import { useOnlineStatus } from '@/hooks/use-online-status';
import { getQueueStatus } from '@/lib/photo-queue';
import { useState, useEffect } from 'react';
import { WifiOff, Upload } from 'lucide-react';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    async function checkQueue() {
      const status = await getQueueStatus();
      setQueueCount(status.pending + status.uploading);
    }
    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline && queueCount === 0) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-sm text-center ${
      isOnline ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
    }`}>
      {!isOnline && (
        <span className="flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          You are offline. Photos will be saved locally.
        </span>
      )}
      {isOnline && queueCount > 0 && (
        <span className="flex items-center justify-center gap-2">
          <Upload className="w-4 h-4 animate-pulse" />
          Uploading {queueCount} queued photo{queueCount > 1 ? 's' : ''}...
        </span>
      )}
    </div>
  );
}
```

Add `<OfflineBanner />` to the root dashboard layout so it appears on all dashboard pages and also to the `/nfc/[id]` layout for sticker pages.

---

## PART 4: PWA INSTALL PROMPT

### 4.1 Install Prompt Component

Create `src/components/pwa-install-prompt.tsx`:

Show a custom install prompt for technicians on their first visit to the dashboard. This catches the browser's `beforeinstallprompt` event and shows a friendly banner:

```
┌─────────────────────────────────────────────────────┐
│  📱 Install FeedbackNFC Warranty                     │
│                                                      │
│  Add to your home screen for quick access to jobs,   │
│  offline photo capture, and instant notifications.   │
│                                                      │
│  [Install App]                      [Maybe Later]    │
└─────────────────────────────────────────────────────┘
```

Logic:
- Only show on mobile devices (check user agent or screen width)
- Only show to users with role `technician` or `service_center_admin`
- Only show once per session (use localStorage to track dismissal)
- If user taps "Maybe Later", don't show again for 7 days
- If user taps "Install App", trigger the browser's native install prompt

### 4.2 Add to Technician Dashboard Layout

Import and render `<PWAInstallPrompt />` in the technician dashboard layout, positioned at the bottom of the screen above the main content.

---

## PART 5: PUSH NOTIFICATIONS (OPTIONAL ENHANCEMENT)

### 5.1 Web Push Setup

If time permits, add web push notifications for technicians. This is an enhancement over SMS — push notifications are free (no Twilio cost) and appear as native notifications on Android.

Install `web-push`:
```bash
npm install web-push
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

Add to environment variables:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:ml@feedbacknfc.com
```

### 5.2 Notification Subscription

In the service worker, handle push subscription. When a technician installs the PWA and grants notification permission, subscribe them to push notifications. Store the subscription endpoint in a new `push_subscriptions` table linked to the user.

### 5.3 Push Events

Send push notifications for these technician events (in addition to existing SMS):
- New job assigned
- Customer confirmed resolution
- SLA approaching deadline

This is optional for MVP. SMS already covers these events. Push is a free supplement that improves response time.

---

## PART 6: MOBILE-SPECIFIC UX IMPROVEMENTS

### 6.1 Tap-to-Call on Technician Job Detail

Ensure customer phone numbers on the technician's job detail view are wrapped in `<a href="tel:+91XXXXXXXXXX">` so technicians can tap to call directly.

### 6.2 Tap-to-Navigate

Ensure customer addresses on the technician's job detail view include a link to Google Maps: `<a href="https://www.google.com/maps/search/?api=1&query=ENCODED_ADDRESS">Navigate →</a>`

### 6.3 Camera Capture Optimization

For photo upload inputs, ensure the HTML attribute forces the rear camera on mobile:
```html
<input type="file" accept="image/*" capture="environment" />
```

### 6.4 Pull-to-Refresh on Job List

Add pull-to-refresh behavior on the technician's My Jobs page. When the technician pulls down on the job list, refetch the latest jobs from the API. This is a familiar mobile pattern that helps technicians check for new assignments without navigating away.

### 6.5 Vibration on New Job Assignment

When a new job appears in the technician's job list (detected via polling or push), trigger a short vibration:
```javascript
if ('vibrate' in navigator) {
  navigator.vibrate(200);
}
```

---

## PART 7: TESTING CHECKLIST

- [ ] **Manifest loads correctly:** Open Chrome DevTools → Application → Manifest. Verify all icons, name, start_url, display mode are correct.
- [ ] **Install prompt works:** Open warranty.feedbacknfc.com/dashboard on Android Chrome. Verify "Add to Home Screen" banner appears (may need to visit twice).
- [ ] **Installed app opens standalone:** After installing, tap the home screen icon. Verify the app opens without browser chrome (no URL bar).
- [ ] **Service worker registered:** Chrome DevTools → Application → Service Workers. Verify service worker is active.
- [ ] **Offline shell loads:** In Chrome DevTools, go to Network tab, check "Offline". Reload the dashboard page. Verify the app shell loads from cache (even if data is stale).
- [ ] **Offline photo capture:** Turn on airplane mode on a real Android phone. Open the technician completion form. Capture a photo. Verify it saves locally with a "saved offline" toast message.
- [ ] **Auto-upload on reconnect:** Turn airplane mode off. Verify the queued photo uploads automatically. Verify the "Uploading X photos..." banner appears and disappears.
- [ ] **Offline banner shows:** Turn on airplane mode. Verify the red "You are offline" banner appears. Turn off airplane mode. Verify it disappears.
- [ ] **Tap-to-call works:** On technician job detail, tap the customer phone number. Verify the phone dialer opens.
- [ ] **Tap-to-navigate works:** On technician job detail, tap the navigate link. Verify Google Maps opens with the customer address.
- [ ] **Camera defaults to rear:** On photo upload, verify the rear camera opens by default (not selfie camera).
- [ ] **PWA shortcuts work:** Long-press the PWA icon on Android home screen. Verify "My Jobs" and "Scan Sticker" shortcuts appear.
- [ ] **Lighthouse PWA audit:** Run Chrome Lighthouse audit on the dashboard page. Target a PWA score of 90+.

---

## IMPLEMENTATION ORDER

1. Install `next-pwa` and `idb` packages
2. Create manifest.json and generate icon set
3. Add meta tags to root layout
4. Configure next.config.js with PWA and runtime caching
5. Create photo queue module (IndexedDB)
6. Create online/offline detection hook
7. Create offline banner component and add to layouts
8. Update photo upload components to use queue when offline
9. Create PWA install prompt component
10. Add mobile UX improvements (tap-to-call, tap-to-navigate, camera capture, pull-to-refresh, vibration)
11. Run testing checklist
12. Optional: Add web push notification support

This can run as a single agent session. No database migrations needed — the photo queue is entirely client-side (IndexedDB). The only server-side change is ensuring the photo upload API handles delayed uploads gracefully.
