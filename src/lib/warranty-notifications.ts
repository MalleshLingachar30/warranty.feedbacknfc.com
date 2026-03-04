import "server-only";

import twilio from "twilio";

interface SmsPayload {
  to: string;
  body: string;
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
