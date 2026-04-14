import { CustomerConfirmResolution } from "@/components/nfc/customer-confirm-resolution";
import { InstallationActivationRequired } from "@/components/nfc/installation-activation-required";
import { CustomerProductView } from "@/components/nfc/customer-product-view";
import { CustomerTicketTracker } from "@/components/nfc/customer-ticket-tracker";
import { NfcLanguageToggle } from "@/components/nfc/language-toggle";
import { PublicProductView } from "@/components/nfc/public-product-view";
import {
  ManagerAssetView,
  TechnicianAssetInfo,
  TechnicianCompleteWork,
  TechnicianStartWork,
  TechnicianTicketView,
} from "@/components/nfc/staff-sticker-views";
import { StickerNotBound } from "@/components/nfc/sticker-not-bound";
import { StickerNotFound } from "@/components/nfc/sticker-not-found";
import { type ProductView, type TicketView } from "@/components/nfc/types";
import { UnregisteredSticker } from "@/components/nfc/unregistered-sticker";
import { WarrantyActivation } from "@/components/nfc/warranty-activation";
import type { TicketStatus } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { detectNfcLanguage } from "@/lib/nfc-i18n";
import { normalizePhone, validateOwnerSession } from "@/lib/otp-session";
import { writeScanLog } from "@/lib/scan-log";
import { normalizeManufacturerStickerConfig } from "@/lib/sticker-config";
import { parseStickerNumber } from "@/lib/sticker-number";
import {
  TICKET_LIVE_STATUS_SELECT,
  type TicketLiveStatusSnapshot,
  toCustomerSafeTrackingPayload,
} from "@/lib/ticket-live-tracking";
import {
  buildAbsoluteAssetUrl,
  buildAbsoluteWarrantyUrl,
} from "@/lib/warranty-app-url";
import {
  parseAppRole,
  parseAppRoleFromClaims,
  type AppRole,
} from "@/lib/roles";
import type {
  ServiceHistoryItem,
  WarrantyPartCatalogItem,
  WarrantyProduct,
  WarrantyProductModel,
  WarrantyTicketPartUsed,
  WarrantyTicketSeverity,
  WarrantyTicketStatus,
  WarrantyTicket,
} from "@/lib/warranty-types";

interface NfcStickerPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    lang?: string | string[];
    src?: string | string[];
    ctx?: string | string[];
  }>;
}

const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

const ROOT_STICKER_HOSTS = new Set(["feedbacknfc.com", "www.feedbacknfc.com"]);

function normalizeTicketStatus(status: TicketStatus): string {
  if (status === "resolved" || status === "closed") {
    return "resolved";
  }

  return status;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstQueryValue(
  value: string | string[] | null | undefined,
): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const candidate = value.find((entry) => typeof entry === "string");
    return candidate ?? null;
  }

  return null;
}

function readRequestHost(requestHeaders: Headers): string | null {
  const rawHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!rawHost) {
    return null;
  }

  const host = rawHost.split(",")[0]?.trim().split(":")[0]?.toLowerCase();
  return host && host.length > 0 ? host : null;
}

function toSearchParamString(
  searchParams: Awaited<NfcStickerPageProps["searchParams"]>,
): string {
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      nextSearchParams.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          nextSearchParams.append(key, entry);
        }
      }
    }
  }

  const serialized = nextSearchParams.toString();
  return serialized ? `?${serialized}` : "";
}

function readCertificateUrl(metadata: unknown): string | null {
  const record = asRecord(metadata);

  const fromAbsolute = asString(record.warrantyCertificateUrl);
  if (fromAbsolute) {
    return fromAbsolute;
  }

  const fromPath = asString(record.warrantyCertificatePath);
  if (fromPath) {
    return fromPath;
  }

  return null;
}

function readEtaLabel(metadata: unknown): string | null {
  const record = asRecord(metadata);
  const etaLabel = asString(record.etaLabel);
  return etaLabel ?? null;
}

function parsePartsUsed(value: unknown): WarrantyTicketPartUsed[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const partName = asString(record.partName);

      if (!partName) {
        return null;
      }

      return {
        partName,
        partNumber: asString(record.partNumber) ?? "",
        cost:
          typeof record.cost === "number" && Number.isFinite(record.cost)
            ? record.cost
            : 0,
      } satisfies WarrantyTicketPartUsed;
    })
    .filter((entry): entry is WarrantyTicketPartUsed => Boolean(entry));
}

function toWarrantySeverity(value: string): WarrantyTicketSeverity {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return "medium";
}

function toWarrantyStatus(status: TicketStatus): WarrantyTicketStatus {
  if (status === "resolved" || status === "closed") {
    return "completed";
  }

  return status;
}

function parsePartsCatalog(value: unknown): WarrantyPartCatalogItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const partName = asString(record.name);

      if (!partName) {
        return null;
      }

      return {
        id: asString(record.id) ?? `part-${index + 1}`,
        name: partName,
        partNumber: asString(record.partNumber) ?? "",
        typicalCost:
          typeof record.typicalCost === "number" &&
          Number.isFinite(record.typicalCost)
            ? record.typicalCost
            : 0,
      } satisfies WarrantyPartCatalogItem;
    })
    .filter((entry): entry is WarrantyPartCatalogItem => Boolean(entry));
}

function parseCommonIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function mapTicketToView(
  ticket: {
    id: string;
    ticketNumber: string;
    productId: string;
    stickerId: string;
    reportedByName: string | null;
    reportedByPhone: string;
    issueCategory: string | null;
    issueDescription: string;
    status: TicketStatus;
    reportedAt: Date;
    resolutionNotes: string | null;
    resolutionPhotos: string[];
    partsUsed: unknown;
    metadata: unknown;
    timelineEntries: Array<{
      id: string;
      eventType: string;
      eventDescription: string | null;
      actorName: string | null;
      actorRole: string | null;
      createdAt: Date;
    }>;
    assignedTechnician: {
      id: string;
      name: string;
      phone: string;
    } | null;
    liveStatus: TicketLiveStatusSnapshot | null;
  },
  product: WarrantyProduct,
  productModel: WarrantyProductModel,
): TicketView {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    productId: ticket.productId,
    stickerId: ticket.stickerId,
    reportedByName: ticket.reportedByName,
    reportedByPhone: ticket.reportedByPhone,
    issueCategory: ticket.issueCategory,
    issueDescription: ticket.issueDescription,
    status: normalizeTicketStatus(ticket.status),
    reportedAt: ticket.reportedAt.toISOString(),
    resolutionNotes: ticket.resolutionNotes,
    resolutionPhotos: ticket.resolutionPhotos,
    partsUsed: parsePartsUsed(ticket.partsUsed),
    assignedTechnicianId: ticket.assignedTechnician?.id ?? null,
    assignedTechnicianName: ticket.assignedTechnician?.name ?? null,
    assignedTechnicianPhone: ticket.assignedTechnician?.phone ?? null,
    etaLabel: readEtaLabel(ticket.metadata),
    timeline: ticket.timelineEntries.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventDescription: event.eventDescription,
      actorName: event.actorName,
      actorRole: event.actorRole,
      createdAt: event.createdAt.toISOString(),
    })),
    partsCatalog: productModel.partsCatalog.map((part) => ({
      id: part.id,
      name: part.name,
      partNumber: part.partNumber,
      typicalCost: part.typicalCost,
    })),
    partTraceabilityMode: productModel.partTraceabilityMode,
    smallPartTrackingMode: productModel.smallPartTrackingMode,
    productSummary: {
      serialNumber: product.serialNumber,
      modelName: productModel.name,
      modelNumber: productModel.modelNumber,
      imageUrl: productModel.imageUrl,
      manufacturerName: product.organizationName,
    },
    liveTracking: toCustomerSafeTrackingPayload({
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      ticketEtaLabel: readEtaLabel(ticket.metadata),
      liveStatus: ticket.liveStatus,
      technicianName: ticket.assignedTechnician?.name ?? null,
      technicianPhone: ticket.assignedTechnician?.phone ?? null,
      revealTravelMetrics: false,
    }),
  };
}

function mapActivationProduct(
  product: WarrantyProduct,
  productModel: WarrantyProductModel
): ProductView {
  return {
    id: product.id,
    stickerId: product.stickerId,
    organizationId: product.organizationId,
    productModelId: product.productModelId,
    serialNumber: product.serialNumber,
    warrantyStatus: product.warrantyStatus,
    warrantyStartDate: product.warrantyStartDate,
    warrantyEndDate: product.warrantyEndDate,
    installationDate: product.installationDate,
    customerName: product.customerName,
    customerPhone: product.customerPhone,
    customerEmail: product.customerEmail,
    customerAddress: product.customerAddress,
    model: {
      id: productModel.id,
      name: productModel.name,
      modelNumber: productModel.modelNumber,
      imageUrl: productModel.imageUrl,
      warrantyDurationMonths: productModel.warrantyDurationMonths,
      commonIssues: productModel.commonIssues,
    },
    organizationName: product.organizationName,
    serviceHistory: [],
  };
}

function mapWarrantyModel(productModel: {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  modelNumber: string | null;
  imageUrl: string | null;
  warrantyDurationMonths: number;
  partTraceabilityMode: "none" | "pack_or_kit" | "unit_scan_mandatory";
  smallPartTrackingMode:
    | "individual"
    | "pack_level"
    | "kit_level"
    | "pack_or_kit";
  commonIssues: unknown;
  requiredSkills: string[];
  partsCatalog: unknown;
}): WarrantyProductModel {
  return {
    id: productModel.id,
    organizationId: productModel.organizationId,
    name: productModel.name,
    category: productModel.category,
    modelNumber: productModel.modelNumber ?? "",
    imageUrl: productModel.imageUrl,
    warrantyDurationMonths: productModel.warrantyDurationMonths,
    partTraceabilityMode: productModel.partTraceabilityMode,
    smallPartTrackingMode: productModel.smallPartTrackingMode,
    commonIssues: parseCommonIssues(productModel.commonIssues),
    requiredSkills: productModel.requiredSkills,
    partsCatalog: parsePartsCatalog(productModel.partsCatalog),
  };
}

function mapWarrantyProduct(product: {
  id: string;
  stickerId: string;
  organizationId: string;
  productModelId: string;
  serialNumber: string | null;
  warrantyStatus: string;
  warrantyStartDate: Date | null;
  warrantyEndDate: Date | null;
  installationDate: Date | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerPincode: string | null;
  metadata: unknown;
  organization: {
    name: string;
  };
  sticker: {
    stickerNumber: number;
  };
}): WarrantyProduct {
  return {
    id: product.id,
    stickerId: product.stickerId,
    stickerNumber: product.sticker.stickerNumber,
    organizationId: product.organizationId,
    organizationName: product.organization.name,
    productModelId: product.productModelId,
    serialNumber: product.serialNumber ?? "Not available",
    warrantyStatus: product.warrantyStatus as WarrantyProduct["warrantyStatus"],
    warrantyStartDate: product.warrantyStartDate?.toISOString() ?? "",
    warrantyEndDate: product.warrantyEndDate?.toISOString() ?? "",
    installationDate: product.installationDate?.toISOString() ?? "",
    customerId: product.customerId,
    customerName: product.customerName ?? "Customer",
    customerPhone: product.customerPhone ?? "",
    customerEmail: product.customerEmail,
    customerAddress: product.customerAddress ?? "",
    customerCity: product.customerCity ?? "",
    customerState: product.customerState ?? "",
    customerPincode: product.customerPincode ?? "",
    warrantyCertificateUrl: readCertificateUrl(product.metadata),
  };
}

function mapWarrantyTicket(ticket: {
  id: string;
  ticketNumber: string;
  productId: string;
  stickerId: string;
  reportedByName: string | null;
  reportedByPhone: string;
  issueCategory: string | null;
  issueDescription: string;
  issueSeverity: string;
  status: TicketStatus;
  reportedAt: Date;
  assignedTechnician: {
    id: string;
    name: string;
    phone: string;
  } | null;
  issuePhotos: string[];
  resolutionNotes: string | null;
  resolutionPhotos: string[];
  partsUsed: unknown;
  laborHours: unknown;
  technicianStartedAt: Date | null;
  technicianCompletedAt: Date | null;
  timelineEntries: Array<{
    id: string;
    eventType: string;
    eventDescription: string | null;
    actorName: string | null;
    actorRole: string | null;
    createdAt: Date;
  }>;
  metadata: unknown;
}): WarrantyTicket {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    productId: ticket.productId,
    stickerId: ticket.stickerId,
    reportedByName: ticket.reportedByName ?? "Customer",
    reportedByPhone: ticket.reportedByPhone,
    issueCategory: ticket.issueCategory ?? "General issue",
    issueDescription: ticket.issueDescription,
    severity: toWarrantySeverity(ticket.issueSeverity),
    status: toWarrantyStatus(ticket.status),
    reportedAt: ticket.reportedAt.toISOString(),
    assignedTechnicianId: ticket.assignedTechnician?.id ?? null,
    assignedTechnicianName: ticket.assignedTechnician?.name ?? null,
    assignedTechnicianPhone: ticket.assignedTechnician?.phone ?? null,
    etaLabel: readEtaLabel(ticket.metadata),
    customerPhotos: ticket.issuePhotos,
    resolutionNotes: ticket.resolutionNotes,
    resolutionPhotos: ticket.resolutionPhotos,
    partsUsed: parsePartsUsed(ticket.partsUsed),
    laborHours:
      typeof ticket.laborHours === "number" ? ticket.laborHours : null,
    aiSuggestedParts: [],
    claimValue: 0,
    technicianStartedAt: ticket.technicianStartedAt?.toISOString() ?? null,
    technicianCompletedAt:
      ticket.technicianCompletedAt?.toISOString() ?? null,
    customerRating: null,
    timeline: ticket.timelineEntries.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventDescription: event.eventDescription ?? "",
      actorName: event.actorName ?? "System",
      actorRole: event.actorRole ?? "system",
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

function toServiceHistoryItems(
  tickets: Array<{
    id: string;
    ticketNumber: string;
    issueCategory: string | null;
    status: TicketStatus;
    reportedAt: Date;
    resolutionNotes: string | null;
  }>
): ServiceHistoryItem[] {
  return tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    issueCategory: ticket.issueCategory ?? "General issue",
    status: toWarrantyStatus(ticket.status),
    reportedAt: ticket.reportedAt.toISOString(),
    resolutionNotes: ticket.resolutionNotes,
  }));
}

export default async function NfcStickerPage({
  params,
  searchParams,
}: NfcStickerPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const requestHeaders = await headers();
  const requestHost = readRequestHost(requestHeaders);
  const isRootStickerHost = requestHost
    ? ROOT_STICKER_HOSTS.has(requestHost)
    : false;
  const requestIp =
    requestHeaders.get("x-forwarded-for") ??
    requestHeaders.get("x-real-ip") ??
    null;
  const requestUserAgent = requestHeaders.get("user-agent");
  const queryString = toSearchParamString(resolvedSearchParams);
  const stickerNumber = parseStickerNumber(id);
  const srcParam = firstQueryValue(resolvedSearchParams.src);
  const ctxParam = firstQueryValue(resolvedSearchParams.ctx);
  const scanSource = srcParam === "qr" ? "qr" : srcParam === "nfc" ? "nfc" : "unknown";
  const scanContext =
    ctxParam === "carton" || ctxParam === "product" ? ctxParam : null;

  if (stickerNumber === null) {
    if (isRootStickerHost) {
      redirect(
        buildAbsoluteAssetUrl(`/nfc/${encodeURIComponent(id)}${queryString}`),
      );
    }

    return <StickerNotFound />;
  }

  const sticker = await db.sticker.findUnique({
    where: { stickerNumber },
    include: {
      allocatedToOrg: {
        select: {
          id: true,
          name: true,
          settings: true,
        },
      },
    },
  });

  if (!sticker) {
    if (isRootStickerHost) {
      redirect(
        buildAbsoluteAssetUrl(`/nfc/${encodeURIComponent(id)}${queryString}`),
      );
    }

    return <StickerNotFound />;
  }

  if (isRootStickerHost) {
    redirect(
      buildAbsoluteWarrantyUrl(`/nfc/${sticker.stickerNumber}${queryString}`),
    );
  }

  after(async () => {
    try {
      await db.stickerScanEvent.create({
        data: {
          stickerId: sticker.id,
          stickerNumber: sticker.stickerNumber,
          organizationId: sticker.allocatedToOrgId,
          source: scanSource,
          userAgent: requestUserAgent ?? null,
        },
      });
    } catch (error) {
      console.error("Sticker scan event capture failed", error);
    }
  });

  if (sticker.status === "unallocated") {
    return <UnregisteredSticker />;
  }

  const product = await db.product.findUnique({
    where: {
      stickerId: sticker.id,
    },
    include: {
      sticker: {
        select: {
          stickerNumber: true,
        },
      },
      productModel: {
        select: {
          id: true,
          organizationId: true,
          name: true,
          category: true,
          modelNumber: true,
          imageUrl: true,
          activationMode: true,
          installationRequired: true,
          warrantyDurationMonths: true,
          partTraceabilityMode: true,
          smallPartTrackingMode: true,
          commonIssues: true,
          requiredSkills: true,
          partsCatalog: true,
        },
      },
      organization: {
        select: {
          name: true,
        },
      },
      customer: {
        select: {
          languagePreference: true,
        },
      },
    },
  });

  if (!product) {
    const orgStickerConfig = sticker.allocatedToOrg
      ? normalizeManufacturerStickerConfig(sticker.allocatedToOrg.settings)
      : null;

    const supportPhoneRaw = orgStickerConfig?.branding.supportPhone ?? "";
    const supportPhone =
      supportPhoneRaw.trim().length > 0 ? supportPhoneRaw.trim() : null;

    return (
      <StickerNotBound
        sticker={{
          id: sticker.id,
          stickerNumber: sticker.stickerNumber,
          stickerSerial: sticker.stickerSerial,
          status: sticker.status,
          stickerType: sticker.type,
          allocatedToOrg: sticker.allocatedToOrgId,
          organizationName: sticker.allocatedToOrg?.name ?? null,
          showSupportPhone:
            Boolean(orgStickerConfig?.branding.showSupportPhone) &&
            Boolean(supportPhone),
          supportPhone,
        }}
      />
    );
  }

  const tickets = await db.ticket.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      reportedAt: "desc",
    },
    include: {
      assignedTechnician: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      liveStatus: {
        select: TICKET_LIVE_STATUS_SELECT,
      },
      timelineEntries: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  const productModel = mapWarrantyModel(product.productModel);
  const mappedProduct = mapWarrantyProduct(product);
  const openTicket =
    tickets.find((ticket) => OPEN_TICKET_STATUSES.includes(ticket.status)) ??
    null;

  const openTicketMapped = openTicket ? mapWarrantyTicket(openTicket) : null;

  const ticketView = openTicket
    ? mapTicketToView(openTicket, mappedProduct, productModel)
    : null;

  const ownerTrackerView =
    openTicket && ticketView
      ? {
          ...ticketView,
          liveTracking: toCustomerSafeTrackingPayload({
            ticketId: openTicket.id,
            ticketStatus: openTicket.status,
            ticketEtaLabel: readEtaLabel(openTicket.metadata),
            liveStatus: openTicket.liveStatus,
            technicianName: openTicket.assignedTechnician?.name ?? null,
            technicianPhone: openTicket.assignedTechnician?.phone ?? null,
            revealTravelMetrics:
              openTicket.status === "technician_enroute" ||
              openTicket.status === "work_in_progress",
          }),
        }
      : null;

  const allTicketViews = tickets.map((ticket) =>
    mapTicketToView(ticket, mappedProduct, productModel),
  );

  const serviceHistory = toServiceHistoryItems(tickets);

  const { userId, sessionClaims } = await getOptionalAuth();
  const queryLanguage = firstQueryValue(resolvedSearchParams.lang);

  let role: AppRole | "anonymous_customer" = "anonymous_customer";
  let technicianProfileId: string | null = null;
  let dbUserPhone: string | null = null;
  let preferredCustomerLanguage: string | null =
    product.customer?.languagePreference ?? null;

  if (userId) {
    const dbUser = await db.user.findUnique({
      where: {
        clerkId: userId,
      },
      select: {
        id: true,
        role: true,
        phone: true,
        languagePreference: true,
        technicianProfile: {
          select: {
            id: true,
          },
        },
      },
    });

    const claimsRole = parseAppRoleFromClaims(sessionClaims);

    if (claimsRole === "customer" && dbUser?.role && dbUser.role !== "customer") {
      role = parseAppRole(dbUser.role);
    } else {
      role = claimsRole;
    }

    if (role === "customer") {
      preferredCustomerLanguage =
        dbUser?.languagePreference ??
        product.customer?.languagePreference ??
        null;
    }

    dbUserPhone = dbUser?.phone ?? null;
    technicianProfileId = dbUser?.technicianProfile?.id ?? null;
  }

  const ownerSession = await validateOwnerSession(await cookies(), product.id);
  const normalizedOwnerPhone = normalizePhone(product.customerPhone ?? "");
  const clerkOwnerVerified =
    role === "customer" &&
    Boolean(dbUserPhone) &&
    normalizePhone(dbUserPhone ?? "") === normalizedOwnerPhone;
  const otpOwnerVerified =
    ownerSession.valid && ownerSession.phone === normalizedOwnerPhone;

  const nfcLanguage = detectNfcLanguage({
    queryLang: queryLanguage,
    preferredLanguage: preferredCustomerLanguage,
    acceptLanguageHeader: requestHeaders.get("accept-language"),
  });

  const languageToggle = (
    <NfcLanguageToggle
      currentLanguage={nfcLanguage}
      englishHref={`/nfc/${sticker.stickerNumber}?lang=en${srcParam ? `&src=${encodeURIComponent(srcParam)}` : ""}${scanContext ? `&ctx=${encodeURIComponent(scanContext)}` : ""}`}
      hindiHref={`/nfc/${sticker.stickerNumber}?lang=hi${srcParam ? `&src=${encodeURIComponent(srcParam)}` : ""}${scanContext ? `&ctx=${encodeURIComponent(scanContext)}` : ""}`}
    />
  );

  if (mappedProduct.warrantyStatus === "pending_activation") {
    const isInstallationDrivenActivation =
      product.productModel.activationMode === "installation_driven" ||
      product.productModel.installationRequired;

    after(async () => {
      await writeScanLog({
        stickerNumber: sticker.stickerNumber,
        productId: product.id,
        scanSource,
        scanContext,
        viewerType: "public",
        actionTaken: isInstallationDrivenActivation
          ? "view_only"
          : "view_activation",
        userAgent: requestUserAgent,
        ipAddress: requestIp,
      });
    });

    if (isInstallationDrivenActivation) {
      return (
        <InstallationActivationRequired
          language={nfcLanguage}
          languageToggle={languageToggle}
          productName={product.productModel.name}
          manufacturerName={product.organization.name}
          serialNumber={mappedProduct.serialNumber}
        />
      );
    }

    return (
      <WarrantyActivation
        product={mapActivationProduct(mappedProduct, productModel)}
        language={nfcLanguage}
        languageToggle={languageToggle}
        activationSource={scanSource === "unknown" ? null : scanSource}
        activationContext={scanContext}
      />
    );
  }

  if (role === "technician") {
    const assignedToCurrentTechnician =
      Boolean(openTicket?.assignedTechnicianId) &&
      openTicket?.assignedTechnicianId === technicianProfileId;

    if (!openTicket || !ticketView) {
      after(async () => {
        await writeScanLog({
          stickerNumber: sticker.stickerNumber,
          productId: product.id,
          scanSource,
          scanContext,
          viewerType: "technician",
          actionTaken: "view_only",
          userAgent: requestUserAgent,
          ipAddress: requestIp,
        });
      });

      return (
        <TechnicianAssetInfo
          product={mapActivationProduct(mappedProduct, productModel)}
          openTicket={null}
          assignedToCurrentTechnician={false}
        />
      );
    }

    if (!assignedToCurrentTechnician) {
      after(async () => {
        await writeScanLog({
          stickerNumber: sticker.stickerNumber,
          productId: product.id,
          scanSource,
          scanContext,
          viewerType: "technician",
          actionTaken: "view_only",
          userAgent: requestUserAgent,
          ipAddress: requestIp,
        });
      });

      return (
        <TechnicianAssetInfo
          product={mapActivationProduct(mappedProduct, productModel)}
          openTicket={ticketView}
          assignedToCurrentTechnician={false}
        />
      );
    }

    if (
      openTicket.status === "assigned" ||
      openTicket.status === "technician_enroute"
    ) {
      after(async () => {
        await writeScanLog({
          stickerNumber: sticker.stickerNumber,
          productId: product.id,
          scanSource,
          scanContext,
          viewerType: "technician",
          actionTaken: "view_work_order",
          userAgent: requestUserAgent,
          ipAddress: requestIp,
        });
      });

      return (
        <TechnicianStartWork ticket={ticketView} technicianId={technicianProfileId} />
      );
    }

    if (openTicket.status === "work_in_progress") {
      after(async () => {
        await writeScanLog({
          stickerNumber: sticker.stickerNumber,
          productId: product.id,
          scanSource,
          scanContext,
          viewerType: "technician",
          actionTaken: "view_work_order",
          userAgent: requestUserAgent,
          ipAddress: requestIp,
        });
      });

      return (
        <TechnicianCompleteWork ticket={ticketView} technicianId={technicianProfileId} />
      );
    }

    after(async () => {
      await writeScanLog({
        stickerNumber: sticker.stickerNumber,
        productId: product.id,
        scanSource,
        scanContext,
        viewerType: "technician",
        actionTaken: "view_work_order",
        userAgent: requestUserAgent,
        ipAddress: requestIp,
      });
    });

    return (
      <TechnicianTicketView
        ticket={ticketView}
        stickerNumber={sticker.stickerNumber}
      />
    );
  }

  if (
    role === "service_center_admin" ||
    role === "manufacturer_admin" ||
    role === "super_admin"
  ) {
    after(async () => {
      await writeScanLog({
        stickerNumber: sticker.stickerNumber,
        productId: product.id,
        scanSource,
        scanContext,
        viewerType: "admin",
        actionTaken: "view_only",
        userAgent: requestUserAgent,
        ipAddress: requestIp,
      });
    });

    return (
      <ManagerAssetView
        product={mapActivationProduct(mappedProduct, productModel)}
        tickets={allTicketViews}
      />
    );
  }

  if (clerkOwnerVerified || otpOwnerVerified) {
    const viewerType = clerkOwnerVerified ? "owner_verified" : "owner_session";

    if (ticketView?.status === "pending_confirmation") {
      after(async () => {
        await writeScanLog({
          stickerNumber: sticker.stickerNumber,
          productId: product.id,
          scanSource,
          scanContext,
          viewerType,
          actionTaken: "view_full",
          userAgent: requestUserAgent,
          ipAddress: requestIp,
        });
      });

      return (
        <CustomerConfirmResolution
          ticket={ticketView}
          language={nfcLanguage}
          languageToggle={languageToggle}
        />
      );
    }

    if (ticketView) {
      after(async () => {
        await writeScanLog({
          stickerNumber: sticker.stickerNumber,
          productId: product.id,
          scanSource,
          scanContext,
          viewerType,
          actionTaken: "view_full",
          userAgent: requestUserAgent,
          ipAddress: requestIp,
        });
      });

      return (
        <CustomerTicketTracker
          ticket={ownerTrackerView ?? ticketView}
          language={nfcLanguage}
          languageToggle={languageToggle}
        />
      );
    }

    after(async () => {
      await writeScanLog({
        stickerNumber: sticker.stickerNumber,
        productId: product.id,
        scanSource,
        scanContext,
        viewerType,
        actionTaken: "view_full",
        userAgent: requestUserAgent,
        ipAddress: requestIp,
      });
    });

    return (
      <CustomerProductView
        stickerNumber={sticker.stickerNumber}
        product={mappedProduct}
        productModel={productModel}
        openTicket={openTicketMapped}
        serviceHistory={serviceHistory}
        certificateUrl={
          mappedProduct.warrantyCertificateUrl ??
          `/api/products/${mappedProduct.id}/certificate?download=1`
        }
        language={nfcLanguage}
        languageToggle={languageToggle}
      />
    );
  }

  after(async () => {
    await writeScanLog({
      stickerNumber: sticker.stickerNumber,
      productId: product.id,
      scanSource,
      scanContext,
      viewerType: "public",
      actionTaken: "view_only",
      userAgent: requestUserAgent,
      ipAddress: requestIp,
    });
  });

  return (
    <PublicProductView
      product={mappedProduct}
      productModel={productModel}
      language={nfcLanguage}
      languageToggle={languageToggle}
    />
  );
}
