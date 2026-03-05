import "server-only";

import twilio from "twilio";

type TwilioClient = ReturnType<typeof twilio>;

type SmsInput = {
  to: string;
  message: string;
};

type EmailInput = {
  to: string | string[];
  subject: string;
  body: string;
};

type WhatsAppInput = {
  to: string;
  message: string;
};

function getTwilioClient(): TwilioClient | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  return twilio(accountSid, authToken);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").trim();
}

function normalizeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];

  return list
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export async function sendSMS(input: SmsInput): Promise<void> {
  const client = getTwilioClient();
  const from =
    process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_FROM_NUMBER ?? "";
  const to = normalizePhone(input.to);

  if (!to) {
    return;
  }

  if (!client || !from) {
    console.info(`[sms:mock] to=${to} body=${input.message}`);
    return;
  }

  try {
    await client.messages.create({
      from,
      to,
      body: input.message,
    });
  } catch (error) {
    console.error("Failed to send SMS", error);
  }
}

export async function sendWhatsApp(input: WhatsAppInput): Promise<void> {
  const client = getTwilioClient();
  const from =
    process.env.TWILIO_WHATSAPP_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? "";
  const normalizedTo = normalizePhone(input.to);
  const to = normalizedTo ? `whatsapp:${normalizedTo}` : "";
  const whatsappFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

  if (!to) {
    return;
  }

  if (!client || !from) {
    console.info(`[whatsapp:mock] to=${to} body=${input.message}`);
    return;
  }

  try {
    await client.messages.create({
      from: whatsappFrom,
      to,
      body: input.message,
    });
  } catch (error) {
    console.error("Failed to send WhatsApp", error);
  }
}

export async function sendEmail(input: EmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipients = normalizeRecipients(input.to);

  if (recipients.length === 0) {
    return;
  }

  if (!apiKey || !from) {
    console.info(
      `[email:mock] to=${recipients.join(",")} subject=${input.subject} body=${input.body}`,
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
        to: recipients,
        subject: input.subject,
        text: input.body,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Failed to send email", details);
    }
  } catch (error) {
    console.error("Failed to send email", error);
  }
}
