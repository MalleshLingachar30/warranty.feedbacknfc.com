import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manufacturer Dashboard",
};

export default function ManufacturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}
