import type { Metadata } from "next"

import { ensureManufacturerAdmin } from "@/lib/auth"

export const metadata: Metadata = {
  title: "Manufacturer Dashboard",
}

export default async function ManufacturerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await ensureManufacturerAdmin()

  return children
}
