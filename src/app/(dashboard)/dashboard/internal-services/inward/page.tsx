import { AssetProductClass } from "@prisma/client";

import { PageHeader } from "@/components/dashboard/page-header";
import { InwardReceiptClient } from "@/components/internal-services/inward-receipt-client";
import { db } from "@/lib/db";

import { resolveServiceCenterPageContext } from "../../_lib/service-center-context";

interface DepotInternalServicesInwardPageProps {
  searchParams: Promise<{ asset?: string | string[] }>;
}

export default async function DepotInternalServicesInwardPage({
  searchParams,
}: DepotInternalServicesInwardPageProps) {
  const { organizationId } = await resolveServiceCenterPageContext();
  const query = await searchParams;
  const prefilledAssetReference =
    typeof query.asset === "string"
      ? query.asset
      : Array.isArray(query.asset)
        ? query.asset[0] ?? null
        : null;

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const serviceCenters = await db.serviceCenter.findMany({
    where: {
      organizationId,
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
      organization: {
        select: {
          name: true,
        },
      },
      manufacturerAuthorizations: true,
    },
  });

  const manufacturerIds = Array.from(
    new Set(serviceCenters.flatMap((center) => center.manufacturerAuthorizations)),
  );

  const assetSuggestions =
    manufacturerIds.length === 0
      ? []
      : await db.assetIdentity.findMany({
          where: {
            organizationId: {
              in: manufacturerIds,
            },
            productClass: AssetProductClass.main_product,
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 12,
          select: {
            publicCode: true,
            serialNumber: true,
            organization: {
              select: {
                name: true,
              },
            },
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inward Receipt"
        description="Receive a faulty unit into depot inventory and create an Internal Service Order separate from field-service tickets."
      />
      <InwardReceiptClient
        submitUrl="/api/service-center/internal-services"
        orderBaseHref="/dashboard/internal-services/orders"
        prefillBaseHref="/dashboard/internal-services/inward"
        organizationContextLabel="this depot / service-center network"
        serviceCenters={serviceCenters.map((center) => ({
          id: center.id,
          name: center.name,
          city: center.city,
          organizationName: center.organization.name,
        }))}
        defaultServiceCenterId={serviceCenters.length === 1 ? serviceCenters[0].id : null}
        defaultAssetReference={prefilledAssetReference}
        serviceCenterLocked={serviceCenters.length === 1}
        assetSuggestions={assetSuggestions.map((asset) => ({
          publicCode: asset.publicCode,
          serialNumber: asset.serialNumber,
          modelName: asset.productModel.name,
          modelNumber: asset.productModel.modelNumber,
          organizationName: asset.organization.name,
        }))}
      />
    </div>
  );
}
