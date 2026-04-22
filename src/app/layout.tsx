import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { PwaRuntime } from "@/components/pwa/pwa-runtime";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getWarrantyAppBaseUrl } from "@/lib/warranty-app-url";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "FeedbackNFC Warranty",
  metadataBase: new URL(getWarrantyAppBaseUrl()),
  title: {
    default: "Scan QR, Activate Warranty Instantly | FeedbackNFC",
    template: "%s | FeedbackNFC Warranty",
  },
  description:
    "Scan the QR code on the TV box or product package and activate warranty instantly. No paperwork, no calls, no friction.",
  openGraph: {
    type: "website",
    siteName: "FeedbackNFC Warranty",
    title: "Scan QR, Activate Warranty Instantly",
    description:
      "Customers scan a QR code at sale or first use to activate warranty in seconds. No paperwork and no manual forms.",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Scan the QR code on the product box to activate warranty instantly",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scan QR, Activate Warranty Instantly",
    description:
      "Activate warranty by scanning the QR code on the box or product package. No paperwork, no friction.",
    images: ["/opengraph-image"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FeedbackNFC Warranty",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192x192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0066CC",
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL;
const clerkEnabled = Boolean(clerkPublishableKey);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!clerkEnabled) {
    return (
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <TooltipProvider>
            <PwaRuntime />
            {children}
            <Toaster />
          </TooltipProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          {...(clerkProxyUrl ? { proxyUrl: clerkProxyUrl } : {})}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          dynamic
        >
          <TooltipProvider>
            <PwaRuntime />
            {children}
            <Toaster />
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
