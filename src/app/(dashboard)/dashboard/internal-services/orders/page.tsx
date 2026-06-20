import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { InternalServiceOrdersTable } from "@/components/internal-services/orders-table";
import { db } from "@/lib/db";

import { resolveInternalServicePageContext } from "../../_lib/service-center-context";

export default async function DepotInternalServicesOrdersPage() {
  const { organizationId } = await resolveInternalServicePageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const orders = await db.internalServiceOrder.findMany({
    where: {
      serviceCenter: {
        organizationId,
      },
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
        description="Depot queue for internal repair work, kept separate from field jobs and warranty ticket execution."
      />
      <Card>
        <CardHeader>
          <CardTitle>Depot-owned orders</CardTitle>
          <CardDescription>
            Track all inwarded internal work by bench stage, assigned engineer, and current status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InternalServiceOrdersTable
            orderBaseHref="/dashboard/internal-services/orders"
            showManufacturer
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
