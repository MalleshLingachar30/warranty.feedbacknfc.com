import { AssetProductClass } from "@prisma/client";

import { InwardReceiptClient } from "@/components/internal-services/inward-receipt-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { db } from "@/lib/db";

import { resolveManufacturerPageContext } from "../../_lib/server-context";

interface ManufacturerInternalServicesInwardPageProps {
  searchParams: Promise<{ asset?: string | string[] }>;
}

export default async function ManufacturerInternalServicesInwardPage({
  searchParams,
}: ManufacturerInternalServicesInwardPageProps) {
  const { organizationId, organizationName } = await resolveManufacturerPageContext();
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
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const [serviceCenters, assetSuggestions] = await Promise.all([
    db.serviceCenter.findMany({
      where: {
        OR: [
          {
            manufacturerAuthorizations: {
              has: organizationId,
            },
          },
          {
            organizationId,
          },
        ],
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
      },
    }),
    db.assetIdentity.findMany({
      where: {
        organizationId,
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
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inward Receipt"
        description="Receive a faulty item into Internal Services and create a depot work order without opening a warranty ticket."
      />
      <InwardReceiptClient
        submitUrl="/api/manufacturer/internal-services"
        scanUrl="/api/manufacturer/internal-services/scan"
        affixUrl="/api/manufacturer/internal-services/scan"
        orderBaseHref="/dashboard/manufacturer/internal-services/orders"
        prefillBaseHref="/dashboard/manufacturer/internal-services/inward"
        organizationContextLabel={organizationName ?? "this manufacturer"}
        serviceCenters={serviceCenters.map((center) => ({
          id: center.id,
          name: center.name,
          city: center.city,
          organizationName: center.organization.name,
        }))}
        assetSuggestions={assetSuggestions.map((asset) => ({
          publicCode: asset.publicCode,
          serialNumber: asset.serialNumber,
          modelName: asset.productModel.name,
          modelNumber: asset.productModel.modelNumber,
          organizationName: asset.organization.name,
        }))}
        defaultAssetReference={prefilledAssetReference}
      />
    </div>
  );
}
