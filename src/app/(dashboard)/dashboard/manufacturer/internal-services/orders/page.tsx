import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { InternalServiceOrdersTable } from "@/components/internal-services/orders-table";
import { db } from "@/lib/db";

import { resolveManufacturerPageContext } from "../../_lib/server-context";

export default async function ManufacturerInternalServicesOrdersPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const orders = await db.internalServiceOrder.findMany({
    where: {
      manufacturerOrgId: organizationId,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
      serviceType: true,
      priority: true,
      receivedAt: true,
      assignedTechnician: {
        select: {
          name: true,
        },
      },
      manufacturerOrg: {
        select: {
          name: true,
        },
      },
      serviceCenter: {
        select: {
          name: true,
          city: true,
        },
      },
      asset: {
        select: {
          publicCode: true,
          serialNumber: true,
          productModel: {
            select: {
              name: true,
              modelNumber: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Service Orders"
        description="Manufacturer-wide queue for inward receipt, repair, QA, and disposition work that stays outside the warranty ticket system."
      />
      <Card>
        <CardHeader>
          <CardTitle>Order queue</CardTitle>
          <CardDescription>
            Every row here is an Internal Service Order, not a customer ticket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InternalServiceOrdersTable
            orderBaseHref="/dashboard/manufacturer/internal-services/orders"
            showManufacturer={false}
            orders={orders.map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              serviceType: order.serviceType,
              priority: order.priority,
              assetPublicCode: order.asset.publicCode,
              assetSerialNumber: order.asset.serialNumber,
              modelName: order.asset.productModel.name,
              modelNumber: order.asset.productModel.modelNumber,
              serviceCenterName: order.serviceCenter.name,
              serviceCenterCity: order.serviceCenter.city,
              manufacturerName: order.manufacturerOrg.name,
              assignedTechnicianName: order.assignedTechnician?.name ?? null,
              receivedAt: order.receivedAt?.toISOString() ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
