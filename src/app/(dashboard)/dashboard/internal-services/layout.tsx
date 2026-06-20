import type { Metadata } from "next";

import { DepotInternalServicesSubNav } from "@/components/internal-services/depot-sub-nav";
import { resolveInternalServicePageContext } from "../_lib/service-center-context";

export const metadata: Metadata = {
  title: "Internal Services",
};

export default async function InternalServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await resolveInternalServicePageContext();

  return (
    <div>
      <DepotInternalServicesSubNav />
      {children}
    </div>
  );
}
