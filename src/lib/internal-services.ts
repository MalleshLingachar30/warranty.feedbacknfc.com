import {
  InternalServiceControlTagSource,
  Prisma,
} from "@prisma/client";

import {
  buildTagEncodedValue,
  buildTagPublicCode,
  tagClassForProductClass,
} from "@/lib/asset-generation";

const INTERNAL_SERVICE_SCAN_URL_PREFIXES = new Set(["r", "nfc", "q", "c"]);

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

export function formatInternalServiceControlTagSource(value: string) {
  return value.replace(/_/g, " ");
}

function extractInternalServiceCodeFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 2 || !INTERNAL_SERVICE_SCAN_URL_PREFIXES.has(segments[0] ?? "")) {
    return null;
  }

  return decodeURIComponent(segments[1] ?? "");
}

function normalizeInternalServiceReference(reference: string) {
  const trimmed = reference.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    try {
      const parsedUrl = trimmed.startsWith("/")
        ? new URL(trimmed, "https://scanner.feedbacknfc.local")
        : new URL(trimmed);
      const extractedCode = extractInternalServiceCodeFromPathname(parsedUrl.pathname);

      return extractedCode?.trim() || trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

type ManufacturerFilterOptions = {
  manufacturerOrgId?: string | null;
  manufacturerOrgIds?: string[] | null;
};

export type InternalServiceAssetSummary = {
  id: string;
  publicCode: string;
  serialNumber: string | null;
  organizationId: string;
  lifecycleState: string;
  productModel: {
    id: string;
    name: string;
    modelNumber: string | null;
  };
};

export type InternalServiceTagSummary = {
  id: string;
  publicCode: string;
  tagClass: string;
  status: string;
  viewerPolicy: string;
  symbology: string;
};

export type InternalServiceResolvedAssetContext = {
  asset: InternalServiceAssetSummary;
  matchedTag: InternalServiceTagSummary | null;
  controllingTag: InternalServiceTagSummary | null;
  referenceSource: "tag" | "asset_code" | "serial";
  controllingTagSource: InternalServiceControlTagSource;
  controllingTagResolvedAt: Date | null;
};

export type InternalServiceScanRecommendedAction =
  | "resume_active_order"
  | "view_latest_closed_order"
  | "start_inward_with_existing_tag"
  | "affix_new_internal_service_label"
  | "manual_asset_lookup_and_affix_label";

export type InternalServiceScanContext = {
  asset: InternalServiceAssetSummary | null;
  matchedTag: InternalServiceTagSummary | null;
  controllingTag: InternalServiceTagSummary | null;
  activeOrder: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  latestClosedOrder: {
    id: string;
    orderNumber: string;
    status: string;
    closedAt: Date | null;
  } | null;
  referenceSource: "tag" | "asset_code" | "serial" | "unknown";
  controllingTagSource: InternalServiceControlTagSource;
  controllingTagResolvedAt: Date | null;
  controllingTagReady: boolean;
  recommendedAction: InternalServiceScanRecommendedAction;
};

export type InternalServiceOpenOrderConflict = {
  id: string;
  orderNumber: string;
  status: string;
};

function buildManufacturerFilter(options?: ManufacturerFilterOptions) {
  const manufacturerOrgIds = Array.from(
    new Set(
      (options?.manufacturerOrgIds ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const singleManufacturerOrgId = options?.manufacturerOrgId?.trim() ?? null;

  if (manufacturerOrgIds.length > 0) {
    return {
      organizationId: {
        in: manufacturerOrgIds,
      },
    } satisfies Prisma.AssetIdentityWhereInput;
  }

  if (singleManufacturerOrgId) {
    return {
      organizationId: singleManufacturerOrgId,
    } satisfies Prisma.AssetIdentityWhereInput;
  }

  return undefined;
}

function preferredInternalServiceTag(
  tags: Array<InternalServiceTagSummary>,
) {
  if (tags.length === 0) {
    return null;
  }

  const ranked = [...tags].sort((left, right) => {
    const tagClassScore = (value: string) => {
      if (value === "unit_service") {
        return 0;
      }

      if (value === "component_unit") {
        return 1;
      }

      return 2;
    };

    const statusScore = (value: string) => {
      switch (value) {
        case "active":
          return 0;
        case "encoded":
          return 1;
        case "printed":
          return 2;
        case "generated":
          return 3;
        default:
          return 4;
      }
    };

    return (
      tagClassScore(left.tagClass) - tagClassScore(right.tagClass) ||
      statusScore(left.status) - statusScore(right.status) ||
      left.publicCode.localeCompare(right.publicCode)
    );
  });

  return ranked[0] ?? null;
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

export async function resolveInternalServiceAssetContextByReference(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: ManufacturerFilterOptions,
): Promise<InternalServiceResolvedAssetContext | null> {
  const normalized = reference.trim();

  if (!normalized) {
    return null;
  }

  const manufacturerFilter = buildManufacturerFilter(options);

  const assetFromTag = await tx.assetTag.findFirst({
    where: {
      publicCode: {
        equals: normalized,
        mode: "insensitive",
      },
      asset: manufacturerFilter,
    },
    select: {
      id: true,
      publicCode: true,
      tagClass: true,
      status: true,
      viewerPolicy: true,
      symbology: true,
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
          tags: {
            select: {
              id: true,
              publicCode: true,
              tagClass: true,
              status: true,
              viewerPolicy: true,
              symbology: true,
            },
          },
        },
      },
    },
  });

  if (assetFromTag?.asset) {
    const tags = assetFromTag.asset.tags;
    const matchedTag: InternalServiceTagSummary = {
      id: assetFromTag.id,
      publicCode: assetFromTag.publicCode,
      tagClass: assetFromTag.tagClass,
      status: assetFromTag.status,
      viewerPolicy: assetFromTag.viewerPolicy,
      symbology: assetFromTag.symbology,
    };
    const controllingTag = preferredInternalServiceTag(tags) ?? matchedTag;

    return {
      asset: {
        id: assetFromTag.asset.id,
        publicCode: assetFromTag.asset.publicCode,
        serialNumber: assetFromTag.asset.serialNumber,
        organizationId: assetFromTag.asset.organizationId,
        lifecycleState: assetFromTag.asset.lifecycleState,
        productModel: assetFromTag.asset.productModel,
      },
      matchedTag,
      controllingTag,
      referenceSource: "tag",
      controllingTagSource: "existing_tag",
      controllingTagResolvedAt: controllingTag ? new Date() : null,
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
      ...manufacturerFilter,
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
      tags: {
        select: {
          id: true,
          publicCode: true,
          tagClass: true,
          status: true,
          viewerPolicy: true,
          symbology: true,
        },
      },
    },
  });

  if (!assetMatch) {
    return null;
  }

  const controllingTag = preferredInternalServiceTag(assetMatch.tags);
  const normalizedReference = normalized.toLowerCase();
  const referenceSource =
    assetMatch.publicCode.toLowerCase() === normalizedReference
      ? "asset_code"
      : "serial";

  return {
    asset: {
      id: assetMatch.id,
      publicCode: assetMatch.publicCode,
      serialNumber: assetMatch.serialNumber,
      organizationId: assetMatch.organizationId,
      lifecycleState: assetMatch.lifecycleState,
      productModel: assetMatch.productModel,
    },
    matchedTag: null,
    controllingTag,
    referenceSource,
    controllingTagSource: controllingTag ? "existing_tag" : "new_affixed_label",
    controllingTagResolvedAt: controllingTag ? new Date() : null,
  };
}

export async function resolveInternalServiceAssetByReference(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: ManufacturerFilterOptions,
) {
  const resolved = await resolveInternalServiceAssetContextByReference(
    tx,
    reference,
    options,
  );

  return resolved?.asset ?? null;
}

export function isInternalServiceControllingTagReady(input: {
  controllingTagId: string | null;
  controllingTagSource: InternalServiceControlTagSource | string;
  controllingTagResolvedAt: Date | null;
}) {
  if (input.controllingTagSource === "dashboard_v1") {
    return true;
  }

  return Boolean(input.controllingTagId && input.controllingTagResolvedAt);
}

export async function resolveInternalServiceScanContext(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: ManufacturerFilterOptions,
): Promise<InternalServiceScanContext> {
  const resolved = await resolveInternalServiceAssetContextByReference(
    tx,
    reference,
    options,
  );

  if (!resolved) {
    return {
      asset: null,
      matchedTag: null,
      controllingTag: null,
      activeOrder: null,
      latestClosedOrder: null,
      referenceSource: "unknown",
      controllingTagSource: "new_affixed_label",
      controllingTagResolvedAt: null,
      controllingTagReady: false,
      recommendedAction: "manual_asset_lookup_and_affix_label",
    };
  }

  const [activeOrder, latestClosedOrder] = await Promise.all([
    tx.internalServiceOrder.findFirst({
      where: {
        assetId: resolved.asset.id,
        status: {
          notIn: ["closed", "cancelled"],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
      },
    }),
    tx.internalServiceOrder.findFirst({
      where: {
        assetId: resolved.asset.id,
        status: "closed",
      },
      orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        closedAt: true,
      },
    }),
  ]);

  const controllingTagReady = isInternalServiceControllingTagReady({
    controllingTagId: resolved.controllingTag?.id ?? null,
    controllingTagSource: resolved.controllingTagSource,
    controllingTagResolvedAt: resolved.controllingTagResolvedAt,
  });

  let recommendedAction: InternalServiceScanRecommendedAction;

  if (activeOrder) {
    recommendedAction = controllingTagReady
      ? "resume_active_order"
      : "affix_new_internal_service_label";
  } else if (latestClosedOrder) {
    recommendedAction = controllingTagReady
      ? "view_latest_closed_order"
      : "affix_new_internal_service_label";
  } else if (controllingTagReady) {
    recommendedAction = "start_inward_with_existing_tag";
  } else {
    recommendedAction = "affix_new_internal_service_label";
  }

  return {
    asset: resolved.asset,
    matchedTag: resolved.matchedTag,
    controllingTag: resolved.controllingTag,
    activeOrder,
    latestClosedOrder,
    referenceSource: resolved.referenceSource,
    controllingTagSource: resolved.controllingTagSource,
    controllingTagResolvedAt: resolved.controllingTagResolvedAt,
    controllingTagReady,
    recommendedAction,
  };
}

export async function findOpenInternalServiceOrderByControllingTag(
  tx: Prisma.TransactionClient,
  controllingTagId: string,
) {
  return tx.internalServiceOrder.findFirst({
    where: {
      controllingTagId,
      status: {
        notIn: ["closed", "cancelled"],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
    },
  });
}

export async function affixInternalServiceLabel(input: {
  tx: Prisma.TransactionClient;
  assetId: string;
}) {
  const asset = await input.tx.assetIdentity.findUnique({
    where: {
      id: input.assetId,
    },
    select: {
      id: true,
      publicCode: true,
      organizationId: true,
      productClass: true,
      tags: {
        select: {
          id: true,
          publicCode: true,
          tagClass: true,
          status: true,
          viewerPolicy: true,
          symbology: true,
        },
      },
    },
  });

  if (!asset) {
    throw new Error("Asset not found for internal-service label affix.");
  }

  const existingTag = preferredInternalServiceTag(asset.tags);
  if (existingTag) {
    return existingTag;
  }

  const batchId = crypto.randomUUID();
  const tagClass = tagClassForProductClass(asset.productClass);
  const symbology = "qr";
  const publicCode = buildTagPublicCode({
    batchId,
    offset: 0,
    tagClass,
    symbology,
  });

  const createdTag = await input.tx.assetTag.create({
    data: {
      publicCode,
      assetId: asset.id,
      generationBatchId: null,
      tagClass,
      symbology,
      status: "active",
      materialVariant: "standard",
      printSizeMm: 30,
      encodedValue: buildTagEncodedValue(publicCode, symbology),
      viewerPolicy: "warehouse_admin",
    },
    select: {
      id: true,
      publicCode: true,
      tagClass: true,
      status: true,
      viewerPolicy: true,
      symbology: true,
    },
  });

  return createdTag;
}

export async function resolveInternalServiceTrackedPartByReference(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: {
    manufacturerOrgId?: string | null;
  },
) {
  const normalized = normalizeInternalServiceReference(reference);

  if (!normalized) {
    return null;
  }

  const manufacturerOrgId = options?.manufacturerOrgId ?? null;

  const tagMatch = await tx.assetTag.findFirst({
    where: {
      OR: [
        {
          publicCode: {
            equals: normalized,
            mode: "insensitive",
          },
        },
        {
          encodedValue: {
            equals: reference.trim(),
            mode: "insensitive",
          },
        },
      ],
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
