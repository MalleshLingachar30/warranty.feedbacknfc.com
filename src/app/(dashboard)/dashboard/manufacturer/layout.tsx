import type { Metadata } from "next";

import { ManufacturerSubNav } from "@/components/manufacturer/sub-nav";
import { ensureManufacturerAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Manufacturer Dashboard",
};

export default async function ManufacturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureManufacturerAdmin();

  return (
    <div>
      <ManufacturerSubNav />
      {children}
    </div>
  );
}
