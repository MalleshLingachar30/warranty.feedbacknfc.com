import { Prisma } from "@prisma/client";

export function formatInternalServiceStatus(value: string) {
  return value.replace(/_/g, " ");
}

export function formatInternalServiceType(value: string) {
  return value.replace(/_/g, " ");
}

export function formatInternalServicePriority(value: string) {
  return value.replace(/_/g, " ");
}

export function formatInternalServiceDisposition(value: string | null) {
  return value ? value.replace(/_/g, " ") : "-";
}

export async function generateInternalServiceOrderNumber(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  const year = now.getFullYear();
  const prefix = `ISO-${year}-`;

  const latest = await tx.internalServiceOrder.findFirst({
    where: {
      orderNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      orderNumber: "desc",
    },
    select: {
      orderNumber: true,
    },
  });

  const latestCounter = latest?.orderNumber
    ? Number.parseInt(latest.orderNumber.slice(prefix.length), 10)
    : 0;

  const nextCounter = Number.isFinite(latestCounter) ? latestCounter + 1 : 1;

  return `${prefix}${String(nextCounter).padStart(6, "0")}`;
}

export async function resolveInternalServiceAssetByReference(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: {
    manufacturerOrgId?: string | null;
  },
) {
  const normalized = reference.trim();

  if (!normalized) {
    return null;
  }

  const manufacturerOrgId = options?.manufacturerOrgId ?? null;

  const assetFromTag = await tx.assetTag.findFirst({
    where: {
      publicCode: {
        equals: normalized,
        mode: "insensitive",
      },
      asset: manufacturerOrgId
        ? {
            organizationId: manufacturerOrgId,
          }
        : undefined,
    },
    select: {
      asset: {
        select: {
          id: true,
          publicCode: true,
          serialNumber: true,
          organizationId: true,
          lifecycleState: true,
          productModel: {
            select: {
              id: true,
              name: true,
              modelNumber: true,
            },
          },
        },
      },
    },
  });

  if (assetFromTag?.asset) {
    return assetFromTag.asset;
  }

  return tx.assetIdentity.findFirst({
    where: {
      OR: [
        {
          publicCode: {
            equals: normalized,
            mode: "insensitive",
          },
        },
        {
          serialNumber: {
            equals: normalized,
            mode: "insensitive",
          },
        },
      ],
      organizationId: manufacturerOrgId ?? undefined,
    },
    select: {
      id: true,
      publicCode: true,
      serialNumber: true,
      organizationId: true,
      lifecycleState: true,
      productModel: {
        select: {
          id: true,
          name: true,
          modelNumber: true,
        },
      },
    },
  });
}

export async function resolveInternalServiceTrackedPartByReference(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: {
    manufacturerOrgId?: string | null;
  },
) {
  const normalized = reference.trim();

  if (!normalized) {
    return null;
  }

  const manufacturerOrgId = options?.manufacturerOrgId ?? null;

  const tagMatch = await tx.assetTag.findFirst({
    where: {
      publicCode: {
        equals: normalized,
        mode: "insensitive",
      },
      asset: manufacturerOrgId
        ? {
            organizationId: manufacturerOrgId,
          }
        : undefined,
    },
    select: {
      id: true,
      publicCode: true,
      asset: {
        select: {
          id: true,
          publicCode: true,
          serialNumber: true,
          productClass: true,
          lifecycleState: true,
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

  if (tagMatch) {
    return {
      asset: tagMatch.asset,
      tag: {
        id: tagMatch.id,
        publicCode: tagMatch.publicCode,
      },
    };
  }

  const assetMatch = await tx.assetIdentity.findFirst({
    where: {
      OR: [
        {
          publicCode: {
            equals: normalized,
            mode: "insensitive",
          },
        },
        {
          serialNumber: {
            equals: normalized,
            mode: "insensitive",
          },
        },
      ],
      organizationId: manufacturerOrgId ?? undefined,
    },
    select: {
      id: true,
      publicCode: true,
      serialNumber: true,
      productClass: true,
      lifecycleState: true,
      productModel: {
        select: {
          name: true,
          modelNumber: true,
        },
      },
    },
  });

  if (!assetMatch) {
    return null;
  }

  return {
    asset: assetMatch,
    tag: null,
  };
}
