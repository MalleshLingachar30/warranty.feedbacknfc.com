import "server-only";

import twilio from "twilio";

interface SmsPayload {
  to: string;
  body: string;
}

interface EmailPayload {
  to: string | string[];
  subject: string;
  text: string;
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    return null;
  }

  return twilio(sid, token);
}

async function sendSms(payload: SmsPayload) {
  const from = process.env.TWILIO_FROM_NUMBER;
  const client = getTwilioClient();

  if (!from || !client) {
    console.info(`[sms:mock] to=${payload.to} body=${payload.body}`);
    return;
  }

  try {
    await client.messages.create({
      from,
      to: payload.to,
      body: payload.body,
    });
  } catch (error) {
    console.error("Failed to send SMS notification", error);
  }
}

async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const to = recipients
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (to.length === 0) {
    return;
  }

  if (!apiKey || !from) {
    console.info(
      `[email:mock] to=${to.join(",")} subject=${payload.subject} body=${payload.text}`,
    );
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: payload.subject,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Failed to send email notification", details);
    }
  } catch (error) {
    console.error("Failed to send email notification", error);
  }
}

function formatInr(value: number) {
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
  await sendSms({
    to: input.technicianPhone,
    body: `New job ${input.ticketNumber}: ${input.issueCategory} at ${input.location}. Product: ${input.productName}.`,
  });
}

export async function sendCustomerEnRouteNotification(input: {
  customerPhone: string;
  customerName: string;
  technicianName: string;
  technicianPhone: string;
  ticketNumber: string;
}) {
  await sendSms({
    to: input.customerPhone,
    body: `${input.technicianName} is on the way for ticket ${input.ticketNumber}. Call: ${input.technicianPhone}.`,
  });
}

export async function sendCustomerWorkStartedNotification(input: {
  customerPhone: string;
  customerName: string;
  ticketNumber: string;
}) {
  await sendSms({
    to: input.customerPhone,
    body: `Service has started for ticket ${input.ticketNumber}.`,
  });
}

export async function sendCustomerCompletionPrompt(input: {
  customerPhone: string;
  customerName: string;
  ticketNumber: string;
  stickerNumber: number;
}) {
  await sendSms({
    to: input.customerPhone,
    body: `Service complete for ${input.ticketNumber}. Please scan sticker #${input.stickerNumber} and confirm resolution.`,
  });
}

export async function sendWarrantyActivatedNotification(input: {
  customerPhone: string;
  productName: string;
  warrantyEndDateLabel: string;
}) {
  await sendSms({
    to: input.customerPhone,
    body: `Your ${input.productName} warranty is active until ${input.warrantyEndDateLabel}.`,
  });
}

export async function sendCustomerWarrantyActivatedEmail(input: {
  customerEmail: string;
  customerName: string;
  productName: string;
  warrantyEndDateLabel: string;
}) {
  await sendEmail({
    to: input.customerEmail,
    subject: `${input.productName} warranty activated`,
    text: `Hi ${input.customerName}, your ${input.productName} warranty is active until ${input.warrantyEndDateLabel}.`,
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
  await sendEmail({
    to: input.serviceCenterEmail,
    subject: `New ticket assigned: ${input.ticketNumber}`,
    text: `Service Center ${input.serviceCenterName}, a new ticket ${input.ticketNumber} has been assigned to ${input.technicianName}. Issue: ${input.issueCategory}. Product: ${input.productName}.`,
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
  await sendEmail({
    to: input.manufacturerEmail,
    subject: `New warranty claim submitted: ${input.claimNumber}`,
    text: `Hello ${input.manufacturerName}, claim ${input.claimNumber} for ticket ${input.ticketNumber} was submitted by ${input.serviceCenterName}. Claimed amount: ${formatInr(input.claimAmount)}.`,
  });
}

export async function sendServiceCenterClaimApprovedEmail(input: {
  serviceCenterEmail: string;
  serviceCenterName: string;
  claimNumber: string;
  approvedAmount: number;
}) {
  await sendEmail({
    to: input.serviceCenterEmail,
    subject: `Claim approved: ${input.claimNumber}`,
    text: `Hello ${input.serviceCenterName}, claim ${input.claimNumber} has been approved for ${formatInr(input.approvedAmount)}.`,
  });
}

export async function sendServiceCenterClaimRejectedEmail(input: {
  serviceCenterEmail: string;
  serviceCenterName: string;
  claimNumber: string;
  reason: string;
}) {
  await sendEmail({
    to: input.serviceCenterEmail,
    subject: `Claim rejected: ${input.claimNumber}`,
    text: `Hello ${input.serviceCenterName}, claim ${input.claimNumber} has been rejected. Reason: ${input.reason}.`,
  });
}
