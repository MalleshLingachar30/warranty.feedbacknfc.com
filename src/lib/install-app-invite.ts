import "server-only";

import { db } from "@/lib/db";
import { sendEmail, sendSMS } from "@/lib/notifications";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";

type InviteRole = "service_center_admin" | "technician";

type InviteMetadataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is InviteMetadataRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function firstName(name: string | null) {
  if (!name) {
    return "there";
  }

  return name.trim().split(/\s+/)[0] ?? "there";
}

function getDashboardPath(role: InviteRole) {
  return role === "technician" ? "/dashboard/my-jobs" : "/dashboard";
}

function buildInstallInviteUrl(role: InviteRole) {
  const params = new URLSearchParams({
    role,
    next: getDashboardPath(role),
  });

  return buildAbsoluteWarrantyUrl(`/install-app?${params.toString()}`);
}

function hasInstallInviteBeenSent(metadata: unknown) {
  if (!isRecord(metadata)) {
    return false;
  }

  const installInvite = metadata.installInvite;
  if (!isRecord(installInvite)) {
    return false;
  }

  return typeof installInvite.sentAt === "string";
}

function mergeInstallInviteMetadata(input: {
  currentMetadata: unknown;
  role: InviteRole;
  channels: string[];
}) {
  const current = isRecord(input.currentMetadata) ? input.currentMetadata : {};
  const installInvite = isRecord(current.installInvite)
    ? current.installInvite
    : {};

  return {
    ...current,
    installInvite: {
      ...installInvite,
      sentAt: new Date().toISOString(),
      role: input.role,
      channels: input.channels,
    },
  };
}

export async function sendInstallInviteIfNeeded(input: {
  userId: string;
  role: InviteRole;
  fallbackEmail?: string | null;
  fallbackPhone?: string | null;
  force?: boolean;
}) {
  const user = await db.user.findUnique({
    where: {
      id: input.userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      metadata: true,
    },
  });

  if (!user) {
    return {
      sent: false,
      reason: "user_not_found",
    } as const;
  }

  if (!input.force && hasInstallInviteBeenSent(user.metadata)) {
    return {
      sent: false,
      reason: "already_sent",
    } as const;
  }

  const email = user.email ?? input.fallbackEmail ?? null;
  const phone = user.phone ?? input.fallbackPhone ?? null;
  const installUrl = buildInstallInviteUrl(input.role);
  const dashboardPath = getDashboardPath(input.role);
  const name = firstName(user.name);

  const smsBody =
    input.role === "technician"
      ? `Hi ${name}, open FeedbackNFC Warranty on your phone: ${installUrl} Sign in, then add it to your home screen. No app store download needed.`
      : `Hi ${name}, open FeedbackNFC Warranty on your phone: ${installUrl} Sign in to ${dashboardPath} and add it to your home screen. No app store download needed.`;

  const emailBody =
    input.role === "technician"
      ? `Hi ${name},\n\nOpen FeedbackNFC Warranty on your phone using this link:\n${installUrl}\n\nAfter you sign in, you can add it to your home screen for faster access. No App Store or Play Store download is required.\n`
      : `Hi ${name},\n\nOpen FeedbackNFC Warranty on your phone using this link:\n${installUrl}\n\nAfter you sign in, you can add it to your home screen for faster access to your service-center workspace. No App Store or Play Store download is required.\n`;

  const sentChannels: string[] = [];

  const deliveryTasks: Promise<void>[] = [];

  if (phone) {
    deliveryTasks.push(
      sendSMS({
        to: phone,
        message: smsBody,
      }).then(() => {
        sentChannels.push("sms");
      }),
    );
  }

  if (email) {
    deliveryTasks.push(
      sendEmail({
        to: email,
        subject: "Open FeedbackNFC Warranty on your phone",
        body: emailBody,
      }).then(() => {
        sentChannels.push("email");
      }),
    );
  }

  if (deliveryTasks.length === 0) {
    return {
      sent: false,
      reason: "no_recipient",
    } as const;
  }

  await Promise.all(deliveryTasks);

  await db.user.update({
    where: {
      id: user.id,
    },
    data: {
      metadata: mergeInstallInviteMetadata({
        currentMetadata: user.metadata,
        role: input.role,
        channels: sentChannels,
      }),
    },
  });

  return {
    sent: true,
    channels: sentChannels,
  } as const;
}
