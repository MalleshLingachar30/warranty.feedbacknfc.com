import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FeedbackNFC Warranty",
    short_name: "Warranty",
    description:
      "Warranty lifecycle management for technicians, service centers, and manufacturers",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0066CC",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-72x72.png",
        sizes: "72x72",
        type: "image/png",
      },
      {
        src: "/icons/icon-96x96.png",
        sizes: "96x96",
        type: "image/png",
      },
      {
        src: "/icons/icon-128x128.png",
        sizes: "128x128",
        type: "image/png",
      },
      {
        src: "/icons/icon-144x144.png",
        sizes: "144x144",
        type: "image/png",
      },
      {
        src: "/icons/icon-152x152.png",
        sizes: "152x152",
        type: "image/png",
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-384x384.png",
        sizes: "384x384",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/dashboard-mobile.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Technician mobile dashboard",
      },
    ],
    shortcuts: [
      {
        name: "My Jobs",
        short_name: "Jobs",
        url: "/dashboard/my-jobs",
        icons: [
          {
            src: "/icons/shortcut-jobs.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: "Open Dashboard",
        short_name: "Home",
        url: "/dashboard",
        icons: [
          {
            src: "/icons/shortcut-dashboard.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
