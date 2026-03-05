import { CustomerConfirmResolution } from "@/components/nfc/customer-confirm-resolution";
import { CustomerProductView } from "@/components/nfc/customer-product-view";
import { CustomerTicketTracker } from "@/components/nfc/customer-ticket-tracker";
import { NfcLanguageToggle } from "@/components/nfc/language-toggle";
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
import { auth } from "@clerk/nextjs/server";
import type { TicketStatus } from "@prisma/client";
import { headers } from "next/headers";

import { db } from "@/lib/db";
import { detectNfcLanguage } from "@/lib/nfc-i18n";
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
  searchParams: Promise<{ lang?: string | string[] }>;
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
    productSummary: {
      serialNumber: product.serialNumber,
      modelName: productModel.name,
      modelNumber: productModel.modelNumber,
      imageUrl: productModel.imageUrl,
      manufacturerName: product.organizationName,
    },
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
  const stickerNumber = Number.parseInt(id, 10);

  if (!Number.isFinite(stickerNumber)) {
    return <StickerNotFound />;
  }

  const sticker = await db.sticker.findUnique({
    where: { stickerNumber },
    include: {
      allocatedToOrg: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!sticker) {
    return <StickerNotFound />;
  }

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
          warrantyDurationMonths: true,
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
    return (
      <StickerNotBound
        sticker={{
          id: sticker.id,
          stickerNumber: sticker.stickerNumber,
          stickerSerial: sticker.stickerSerial,
          status: sticker.status,
          allocatedToOrg: sticker.allocatedToOrgId,
          organizationName: sticker.allocatedToOrg?.name ?? null,
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

  const allTicketViews = tickets.map((ticket) =>
    mapTicketToView(ticket, mappedProduct, productModel),
  );

  const serviceHistory = toServiceHistoryItems(tickets);

  const { userId, sessionClaims } = await auth();
  const requestHeaders = await headers();
  const queryLanguage = firstQueryValue(resolvedSearchParams.lang);

  let role: AppRole | "anonymous_customer" = "anonymous_customer";
  let technicianProfileId: string | null = null;
  let preferredCustomerLanguage: string | null =
    product.customer?.languagePreference ?? null;

  if (userId) {
    const dbUser = await db.user.findUnique({
      where: {
        clerkId: userId,
      },
      select: {
        role: true,
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

    technicianProfileId = dbUser?.technicianProfile?.id ?? null;
  }

  const nfcLanguage = detectNfcLanguage({
    queryLang: queryLanguage,
    preferredLanguage: preferredCustomerLanguage,
    acceptLanguageHeader: requestHeaders.get("accept-language"),
  });

  const languageToggle = (
    <NfcLanguageToggle
      currentLanguage={nfcLanguage}
      englishHref={`/nfc/${sticker.stickerNumber}?lang=en`}
      hindiHref={`/nfc/${sticker.stickerNumber}?lang=hi`}
    />
  );

  if (
    role === "anonymous_customer" ||
    role === "customer"
  ) {
    if (mappedProduct.warrantyStatus === "pending_activation") {
      return (
        <WarrantyActivation
          product={mapActivationProduct(mappedProduct, productModel)}
          language={nfcLanguage}
          languageToggle={languageToggle}
        />
      );
    }

    if (ticketView?.status === "pending_confirmation") {
      return (
        <CustomerConfirmResolution
          ticket={ticketView}
          language={nfcLanguage}
          languageToggle={languageToggle}
        />
      );
    }

    if (ticketView) {
      return (
        <CustomerTicketTracker
          ticket={ticketView}
          language={nfcLanguage}
          languageToggle={languageToggle}
        />
      );
    }

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

  if (role === "technician") {
    const assignedToCurrentTechnician =
      Boolean(openTicket?.assignedTechnicianId) &&
      openTicket?.assignedTechnicianId === technicianProfileId;

    if (!openTicket || !ticketView) {
      return (
        <TechnicianAssetInfo
          product={mapActivationProduct(mappedProduct, productModel)}
          openTicket={null}
          assignedToCurrentTechnician={false}
        />
      );
    }

    if (!assignedToCurrentTechnician) {
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
      return (
        <TechnicianStartWork ticket={ticketView} technicianId={technicianProfileId} />
      );
    }

    if (openTicket.status === "work_in_progress") {
      return (
        <TechnicianCompleteWork ticket={ticketView} technicianId={technicianProfileId} />
      );
    }

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
    return (
      <ManagerAssetView
        product={mapActivationProduct(mappedProduct, productModel)}
        tickets={allTicketViews}
      />
    );
  }

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
