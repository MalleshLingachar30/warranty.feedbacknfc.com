import type { Metadata } from "next";

import { DepotInternalServicesSubNav } from "@/components/internal-services/depot-sub-nav";

export const metadata: Metadata = {
  title: "Internal Services",
};

export default function InternalServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <DepotInternalServicesSubNav />
      {children}
    </div>
  );
}
