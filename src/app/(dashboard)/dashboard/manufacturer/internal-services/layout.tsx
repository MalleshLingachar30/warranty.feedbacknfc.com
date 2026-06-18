import type { Metadata } from "next";

import { ManufacturerInternalServicesSubNav } from "@/components/internal-services/manufacturer-sub-nav";

export const metadata: Metadata = {
  title: "Manufacturer Internal Services",
};

export default function ManufacturerInternalServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ManufacturerInternalServicesSubNav />
      {children}
    </div>
  );
}
