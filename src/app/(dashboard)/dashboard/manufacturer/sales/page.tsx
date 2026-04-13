import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { db } from "@/lib/db";
import {
  saleRegistrationSelect,
  serializeSaleRegistrationRow,
} from "@/lib/installation-workflow-view";

import { resolveManufacturerPageContext } from "../_lib/server-context";

const SaleRegistrationsClient = dynamic(
  () =>
    import("@/components/manufacturer/sale-registrations-client").then(
      (mod) => mod.SaleRegistrationsClient,
    ),
  {
    loading: () => <ClientPageLoading rows={6} />,
  },
);

export default async function ManufacturerSalesPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  const registrations = organizationId
    ? await db.saleRegistration.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          registeredAt: "desc",
        },
        take: 200,
        select: saleRegistrationSelect,
      })
    : [];

  return (
    <SaleRegistrationsClient
      initialRegistrations={registrations.map(serializeSaleRegistrationRow)}
    />
  );
}
