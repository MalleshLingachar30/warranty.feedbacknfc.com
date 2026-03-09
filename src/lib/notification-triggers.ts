import "server-only";

import { sendEmail, sendSMS, sendWhatsApp } from "@/lib/notifications";
import { getWarrantyAppBaseUrl } from "@/lib/warranty-app-url";

type NotificationLanguage = "en" | "hi";
type StickerTechnologyMode = "qr_only" | "nfc_qr" | "nfc_only";

function normalizeNotificationLanguage(
  preference: string | null | undefined,
): NotificationLanguage {
  const normalized = preference?.trim().toLowerCase();

  if (normalized?.startsWith("hi")) {
    return "hi";
  }

  return "en";
}

function normalizeStickerTechnologyMode(
  value: unknown,
): StickerTechnologyMode {
  if (value === "qr_only" || value === "nfc_qr" || value === "nfc_only") {
    return value;
  }

  return "qr_only";
}

function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function onWarrantyActivated(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
  stickerNumber: number;
  stickerType?: StickerTechnologyMode | null;
  certificateUrl?: string | null;
  languagePreference?: string | null;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  const stickerType = normalizeStickerTechnologyMode(input.stickerType);
  const certificateSuffix =
    input.certificateUrl && input.certificateUrl.trim().length > 0
      ? language === "hi"
        ? ` प्रमाणपत्र: ${input.certificateUrl}.`
        : ` Certificate: ${input.certificateUrl}.`
      : "";

  const stickerReminder =
    language === "hi"
      ? stickerType === "nfc_only"
        ? "आपके उत्पाद पर वारंटी स्टिकर लगा है। सेवा के लिए इसे कभी भी टैप करें।"
        : "आपके उत्पाद पर वारंटी स्टिकर लगा है। सेवा के लिए इसे कभी भी स्कैन करें।"
      : stickerType === "nfc_only"
        ? "A warranty sticker is on your product. Tap it anytime for service."
        : "A warranty sticker is on your product. Scan it anytime for service.";

  const message =
    language === "hi"
      ? `आपके ${input.productName} की वारंटी ${input.warrantyEndDateLabel} तक सक्रिय है। ${stickerReminder}${certificateSuffix}`
      : `Your ${input.productName} warranty is active until ${input.warrantyEndDateLabel}. ${stickerReminder}${certificateSuffix}`;

  await sendSMS({
    to: input.customerPhone,
    message,
  });
}

export async function onOtpVerificationCode(input: {
  customerPhone: string;
  otpCode: string;
  languagePreference?: string | null;
  strictDelivery?: boolean;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  const message =
    language === "hi"
      ? `आपका FeedbackNFC सत्यापन कोड है: ${input.otpCode}। 5 मिनट के लिए वैध। यह कोड किसी से साझा न करें।`
      : `Your FeedbackNFC verification code is: ${input.otpCode}. Valid for 5 minutes. Do not share this code.`;

  await sendSMS({
    to: input.customerPhone,
    message,
    strict: input.strictDelivery,
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
  languagePreference?: string | null;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  await sendSMS({
    to: input.customerPhone,
    message:
      language === "hi"
        ? `${input.technicianName} रास्ते में हैं। ETA: ${input.etaLabel}. कॉल करें: ${input.technicianPhone}. टिकट: ${input.ticketNumber}.`
        : `${input.technicianName} is on the way. ETA: ${input.etaLabel}. Call: ${input.technicianPhone}. Ticket: ${input.ticketNumber}.`,
  });
}

export async function onWorkStarted(input: {
  customerPhone: string;
  ticketNumber: string;
  productName?: string;
  languagePreference?: string | null;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  const productLabel = input.productName ? ` on your ${input.productName}` : "";
  const message =
    language === "hi"
      ? input.productName
        ? `आपके ${input.productName} पर सेवा शुरू हो गई है। टिकट: ${input.ticketNumber}.`
        : `सेवा कार्य शुरू हो गया है। टिकट: ${input.ticketNumber}.`
      : `Service has begun${productLabel}. Ticket: ${input.ticketNumber}.`;

  await sendSMS({
    to: input.customerPhone,
    message,
  });
}

export async function onWorkCompleted(input: {
  customerPhone: string;
  ticketNumber: string;
  stickerNumber: number;
  languagePreference?: string | null;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  const link = `${getWarrantyAppBaseUrl()}/nfc/${input.stickerNumber}`;
  await sendSMS({
    to: input.customerPhone,
    message:
      language === "hi"
        ? `सेवा पूरी हो गई! पुष्टि के लिए यहाँ क्लिक करें: ${link} (टिकट: ${input.ticketNumber})`
        : `Service complete! Confirm resolution: ${link} (Ticket: ${input.ticketNumber})`,
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
  languagePreference?: string | null;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  await sendSMS({
    to: input.customerPhone,
    message:
      language === "hi"
        ? `आपके ${input.productName} की वारंटी 30 दिनों में समाप्त होगी (${input.warrantyEndDateLabel}).`
        : `Your ${input.productName} warranty expires in 30 days (${input.warrantyEndDateLabel}).`,
  });
}

export async function onWarrantyExpiring30DaysWhatsApp(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
  languagePreference?: string | null;
}): Promise<void> {
  const language = normalizeNotificationLanguage(input.languagePreference);
  await sendWhatsApp({
    to: input.customerPhone,
    message:
      language === "hi"
        ? `आपके ${input.productName} की वारंटी 30 दिनों में समाप्त होगी (${input.warrantyEndDateLabel}).`
        : `Your ${input.productName} warranty expires in 30 days (${input.warrantyEndDateLabel}).`,
  });
}
