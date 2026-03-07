import type { Metadata } from "next";

import { ManufacturerSubNav } from "@/components/manufacturer/sub-nav";
import { resolveManufacturerPageContext } from "./_lib/server-context";

export const metadata: Metadata = {
  title: "Manufacturer Dashboard",
};

export default async function ManufacturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organizationName } = await resolveManufacturerPageContext();

  return (
    <div>
      {organizationName ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active Manufacturer
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {organizationName}
          </p>
        </div>
      ) : null}
      <ManufacturerSubNav />
      {children}
    </div>
  );
}
