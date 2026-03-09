import type { Metadata } from "next";

import { ManufacturerSubNav } from "@/components/manufacturer/sub-nav";

export const metadata: Metadata = {
  title: "Manufacturer Dashboard",
};

export default function ManufacturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ManufacturerSubNav />
      {children}
    </div>
  );
}
