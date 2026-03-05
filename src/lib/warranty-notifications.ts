import "server-only";

import { sendEmail } from "@/lib/notifications";
import {
  onClaimApproved,
  onClaimRejected,
  onClaimSubmitted,
  onCustomerConfirmed,
  onSlaBreached,
  onTechnicianEnRoute,
  onTicketCreated,
  onWarrantyActivated,
  onWarrantyExpiring30Days,
  onWorkCompleted,
  onWorkStarted,
} from "@/lib/notification-triggers";

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export async function sendTechnicianAssignmentSms(input: {
  technicianName: string;
  technicianPhone: string;
  issueCategory: string;
  location: string;
  productName: string;
  ticketNumber: string;
}) {
  await onTicketCreated({
    technicianPhone: input.technicianPhone,
    issueCategory: input.issueCategory,
    location: input.location,
    productName: input.productName,
    ticketNumber: input.ticketNumber,
    technicianName: input.technicianName,
  });
}

export async function sendCustomerEnRouteNotification(input: {
  customerPhone: string;
  customerName: string;
  technicianName: string;
  technicianPhone: string;
  ticketNumber: string;
  etaLabel?: string;
  languagePreference?: string | null;
}) {
  await onTechnicianEnRoute({
    customerPhone: input.customerPhone,
    technicianName: input.technicianName,
    technicianPhone: input.technicianPhone,
    ticketNumber: input.ticketNumber,
    etaLabel: input.etaLabel ?? "45 mins",
    languagePreference: input.languagePreference,
  });
}

export async function sendCustomerWorkStartedNotification(input: {
  customerPhone: string;
  customerName: string;
  ticketNumber: string;
  productName?: string;
  languagePreference?: string | null;
}) {
  await onWorkStarted({
    customerPhone: input.customerPhone,
    ticketNumber: input.ticketNumber,
    productName: input.productName,
    languagePreference: input.languagePreference,
  });
}

export async function sendCustomerCompletionPrompt(input: {
  customerPhone: string;
  customerName: string;
  ticketNumber: string;
  stickerNumber: number;
  languagePreference?: string | null;
}) {
  await onWorkCompleted({
    customerPhone: input.customerPhone,
    ticketNumber: input.ticketNumber,
    stickerNumber: input.stickerNumber,
    languagePreference: input.languagePreference,
  });
}

export async function sendTechnicianResolutionConfirmedNotification(input: {
  technicianPhone: string;
  ticketNumber: string;
}) {
  await onCustomerConfirmed({
    technicianPhone: input.technicianPhone,
    ticketNumber: input.ticketNumber,
  });
}

export async function sendWarrantyActivatedNotification(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
  stickerNumber: number;
  stickerType?: "qr_only" | "nfc_qr" | "nfc_only" | null;
  certificateUrl?: string | null;
  languagePreference?: string | null;
}) {
  await onWarrantyActivated(input);
}

export async function sendWarrantyExpiryReminderNotification(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
  languagePreference?: string | null;
}) {
  await onWarrantyExpiring30Days(input);
}

export async function sendCustomerWarrantyActivatedEmail(input: {
  customerEmail: string;
  customerName: string;
  productName: string;
  warrantyEndDateLabel: string;
  certificateUrl?: string | null;
}) {
  const certificateSuffix =
    input.certificateUrl && input.certificateUrl.trim().length > 0
      ? ` Download certificate: ${input.certificateUrl}`
      : "";

  await sendEmail({
    to: input.customerEmail,
    subject: `${input.productName} warranty activated`,
    body: `Hi ${input.customerName}, your ${input.productName} warranty is active until ${input.warrantyEndDateLabel}.${certificateSuffix}`,
  });
}

export async function sendServiceCenterTicketAssignedEmail(input: {
  serviceCenterEmail: string;
  serviceCenterName: string;
  ticketNumber: string;
  issueCategory: string;
  productName: string;
  technicianName: string;
}) {
  await onTicketCreated({
    technicianPhone: "",
    issueCategory: input.issueCategory,
    location: "Customer location",
    productName: input.productName,
    ticketNumber: input.ticketNumber,
    serviceCenterEmail: input.serviceCenterEmail,
    serviceCenterName: input.serviceCenterName,
    technicianName: input.technicianName,
  });
}

export async function sendManufacturerClaimSubmittedEmail(input: {
  manufacturerEmail: string;
  manufacturerName: string;
  claimNumber: string;
  ticketNumber: string;
  serviceCenterName: string;
  claimAmount: number;
}) {
  await onClaimSubmitted({
    manufacturerEmail: input.manufacturerEmail,
    claimNumber: input.claimNumber,
    ticketNumber: input.ticketNumber,
    serviceCenterName: input.serviceCenterName,
    claimAmount: input.claimAmount,
  });
}

export async function sendServiceCenterClaimApprovedEmail(input: {
  serviceCenterEmail: string;
  serviceCenterName: string;
  claimNumber: string;
  approvedAmount: number;
  serviceCenterPhone?: string;
}) {
  await onClaimApproved({
    serviceCenterEmail: input.serviceCenterEmail,
    serviceCenterName: input.serviceCenterName,
    claimNumber: input.claimNumber,
    approvedAmount: input.approvedAmount,
    serviceCenterPhone: input.serviceCenterPhone,
  });
}

export async function sendServiceCenterClaimRejectedEmail(input: {
  serviceCenterEmail: string;
  serviceCenterName: string;
  claimNumber: string;
  reason: string;
  serviceCenterPhone?: string;
}) {
  await onClaimRejected({
    serviceCenterEmail: input.serviceCenterEmail,
    serviceCenterName: input.serviceCenterName,
    claimNumber: input.claimNumber,
    reason: input.reason,
    serviceCenterPhone: input.serviceCenterPhone,
  });
}

export async function sendSlaBreachNotification(input: {
  ticketNumber: string;
  serviceCenterEmail?: string | null;
  manufacturerEmail?: string | null;
}) {
  await onSlaBreached({
    ticketNumber: input.ticketNumber,
    serviceCenterEmail: input.serviceCenterEmail ?? undefined,
    manufacturerEmail: input.manufacturerEmail ?? undefined,
  });
}

export function formatClaimAmountForNotification(amount: number): string {
  return formatInr(amount);
}
