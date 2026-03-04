import { CustomerConfirmResolution } from "@/components/nfc/customer-confirm-resolution";
import { CustomerProductView } from "@/components/nfc/customer-product-view";
import { CustomerTicketTracker } from "@/components/nfc/customer-ticket-tracker";
import { StickerNotBound } from "@/components/nfc/sticker-not-bound";
import { StickerNotFound } from "@/components/nfc/sticker-not-found";
import { type ProductView, type TicketView } from "@/components/nfc/types";
import { UnregisteredSticker } from "@/components/nfc/unregistered-sticker";
import { WarrantyActivation } from "@/components/nfc/warranty-activation";
import { getStickerLookup } from "@/lib/warranty-store";
import type {
  WarrantyProduct,
  WarrantyProductModel,
  WarrantyTicket,
} from "@/lib/warranty-types";

interface NfcStickerPageProps {
  params: Promise<{ id: string }>;
}

function normalizeTicketStatus(status: string): string {
  if (status === "completed") {
    return "resolved";
  }

  return status;
}

function mapTicketToView(
  ticket: WarrantyTicket,
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
    reportedAt: ticket.reportedAt,
    resolutionNotes: ticket.resolutionNotes,
    resolutionPhotos: ticket.resolutionPhotos,
    partsUsed: ticket.partsUsed,
    assignedTechnicianId: ticket.assignedTechnicianId,
    assignedTechnicianName: ticket.assignedTechnicianName,
    assignedTechnicianPhone: ticket.assignedTechnicianPhone,
    etaLabel: ticket.etaLabel,
    timeline: ticket.timeline.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventDescription: event.eventDescription,
      actorName: event.actorName,
      actorRole: event.actorRole,
      createdAt: event.createdAt,
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
  productModel: WarrantyProductModel,
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

export default async function NfcStickerPage({ params }: NfcStickerPageProps) {
  const { id } = await params;
  const stickerNumber = Number.parseInt(id, 10);

  if (!Number.isFinite(stickerNumber)) {
    return <StickerNotFound />;
  }

  const payload = getStickerLookup(stickerNumber);

  if (!payload.sticker) {
    return <StickerNotFound />;
  }

  if (payload.sticker.status === "unregistered") {
    return <UnregisteredSticker />;
  }

  if (!payload.product) {
    return (
      <StickerNotBound
        sticker={{
          id: payload.sticker.id,
          stickerNumber: payload.sticker.stickerNumber,
          stickerSerial: payload.sticker.stickerSerial,
          status: payload.sticker.status,
          allocatedToOrg: null,
          organizationName: payload.sticker.organizationName,
        }}
      />
    );
  }

  if (!payload.productModel) {
    return <StickerNotFound />;
  }

  const ticketView = payload.openTicket
    ? mapTicketToView(payload.openTicket, payload.product, payload.productModel)
    : null;

  if (payload.product.warrantyStatus === "pending_activation") {
    return (
      <WarrantyActivation
        product={mapActivationProduct(payload.product, payload.productModel)}
      />
    );
  }

  if (ticketView?.status === "pending_confirmation") {
    return <CustomerConfirmResolution ticket={ticketView} />;
  }

  if (ticketView) {
    return <CustomerTicketTracker ticket={ticketView} />;
  }

  return (
    <CustomerProductView
      stickerNumber={payload.sticker.stickerNumber}
      product={payload.product}
      productModel={payload.productModel}
      openTicket={payload.openTicket}
      serviceHistory={payload.serviceHistory}
    />
  );
}
