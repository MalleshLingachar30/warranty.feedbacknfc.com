import "server-only";

import { sendEmail, sendSMS, sendWhatsApp } from "@/lib/notifications";

function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function getWarrantyAppBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_WARRANTY_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://warranty.feedbacknfc.com";

  return explicit.replace(/\/+$/, "");
}

export async function onWarrantyActivated(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
}): Promise<void> {
  await sendSMS({
    to: input.customerPhone,
    message: `Your ${input.productName} warranty is active until ${input.warrantyEndDateLabel}. Scan QR anytime for service.`,
  });
}

export async function onTicketCreated(input: {
  technicianPhone?: string;
  issueCategory: string;
  location: string;
  productName: string;
  ticketNumber: string;
  serviceCenterEmail?: string;
  serviceCenterName?: string;
  technicianName?: string;
}): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  if (input.technicianPhone) {
    tasks.push(
      sendSMS({
        to: input.technicianPhone,
        message: `New job: ${input.issueCategory} at ${input.location}. Product: ${input.productName}. Ticket: ${input.ticketNumber}.`,
      }),
    );
  }

  if (input.serviceCenterEmail) {
    tasks.push(
      sendEmail({
        to: input.serviceCenterEmail,
        subject: `New ticket assigned: ${input.ticketNumber}`,
        body: `New ticket ${input.ticketNumber} assigned to ${input.technicianName ?? "technician"}. Issue: ${input.issueCategory}. Product: ${input.productName}. Service center: ${input.serviceCenterName ?? "-"}.`,
      }),
    );
  }

  await Promise.all(tasks);
}

export async function onTechnicianEnRoute(input: {
  customerPhone: string;
  technicianName: string;
  technicianPhone: string;
  ticketNumber: string;
  etaLabel: string;
}): Promise<void> {
  await sendSMS({
    to: input.customerPhone,
    message: `${input.technicianName} is on the way. ETA: ${input.etaLabel}. Call: ${input.technicianPhone}. Ticket: ${input.ticketNumber}.`,
  });
}

export async function onWorkStarted(input: {
  customerPhone: string;
  ticketNumber: string;
  productName?: string;
}): Promise<void> {
  const productLabel = input.productName ? ` on your ${input.productName}` : "";
  await sendSMS({
    to: input.customerPhone,
    message: `Service has begun${productLabel}. Ticket: ${input.ticketNumber}.`,
  });
}

export async function onWorkCompleted(input: {
  customerPhone: string;
  ticketNumber: string;
  stickerNumber: number;
}): Promise<void> {
  const link = `${getWarrantyAppBaseUrl()}/nfc/${input.stickerNumber}`;
  await sendSMS({
    to: input.customerPhone,
    message: `Service complete! Confirm resolution: ${link} (Ticket: ${input.ticketNumber})`,
  });
}

export async function onCustomerConfirmed(input: {
  technicianPhone: string;
  ticketNumber: string;
}): Promise<void> {
  await sendSMS({
    to: input.technicianPhone,
    message: `Customer confirmed resolution for ticket ${input.ticketNumber}.`,
  });
}

export async function onClaimSubmitted(input: {
  manufacturerEmail: string;
  claimNumber: string;
  ticketNumber: string;
  serviceCenterName: string;
  claimAmount: number;
}): Promise<void> {
  await sendEmail({
    to: input.manufacturerEmail,
    subject: `New warranty claim ${input.claimNumber}`,
    body: `New warranty claim ${input.claimNumber} from ${input.serviceCenterName}. Ticket: ${input.ticketNumber}. Amount: ${inr(input.claimAmount)}.`,
  });
}

export async function onClaimApproved(input: {
  serviceCenterEmail?: string;
  serviceCenterPhone?: string;
  claimNumber: string;
  approvedAmount: number;
  serviceCenterName: string;
}): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  const message = `Claim ${input.claimNumber} approved. Amount: ${inr(input.approvedAmount)}.`;

  if (input.serviceCenterEmail) {
    tasks.push(
      sendEmail({
        to: input.serviceCenterEmail,
        subject: `Claim approved: ${input.claimNumber}`,
        body: `Hello ${input.serviceCenterName}, ${message}`,
      }),
    );
  }

  if (input.serviceCenterPhone) {
    tasks.push(sendSMS({ to: input.serviceCenterPhone, message }));
  }

  await Promise.all(tasks);
}

export async function onClaimRejected(input: {
  serviceCenterEmail?: string;
  serviceCenterPhone?: string;
  claimNumber: string;
  reason: string;
  serviceCenterName: string;
}): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  const message = `Claim ${input.claimNumber} rejected. Reason: ${input.reason}.`;

  if (input.serviceCenterEmail) {
    tasks.push(
      sendEmail({
        to: input.serviceCenterEmail,
        subject: `Claim rejected: ${input.claimNumber}`,
        body: `Hello ${input.serviceCenterName}, ${message}`,
      }),
    );
  }

  if (input.serviceCenterPhone) {
    tasks.push(sendSMS({ to: input.serviceCenterPhone, message }));
  }

  await Promise.all(tasks);
}

export async function onSlaBreached(input: {
  ticketNumber: string;
  manufacturerEmail?: string;
  serviceCenterEmail?: string;
}): Promise<void> {
  const recipients = [input.manufacturerEmail, input.serviceCenterEmail].filter(
    (value): value is string => Boolean(value && value.trim().length > 0),
  );

  if (recipients.length === 0) {
    return;
  }

  await sendEmail({
    to: recipients,
    subject: `SLA breached: ${input.ticketNumber}`,
    body: `Ticket ${input.ticketNumber} has breached SLA and requires escalation.`,
  });
}

export async function onWarrantyExpiring30Days(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
}): Promise<void> {
  await sendSMS({
    to: input.customerPhone,
    message: `Your ${input.productName} warranty expires in 30 days (${input.warrantyEndDateLabel}).`,
  });
}

export async function onWarrantyExpiring30DaysWhatsApp(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
}): Promise<void> {
  await sendWhatsApp({
    to: input.customerPhone,
    message: `Your ${input.productName} warranty expires in 30 days (${input.warrantyEndDateLabel}).`,
  });
}
