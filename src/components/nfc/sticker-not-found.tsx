import { CircleAlert, Mail, PhoneCall } from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";

export function StickerNotFound() {
  return (
    <NfcPublicShell
      title="Sticker Not Registered"
      description="This sticker is not registered. Please verify the sticker and try again (scan or tap), or contact support."
      footer="Need help immediately? Keep this sticker handy and share its number with support."
    >
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm leading-relaxed">
            We could not find a product linked to this sticker. It may be
            mistyped, damaged, or not yet activated in the system.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-900">Support Contacts</p>
        <a
          href="tel:+917899910288"
          className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700"
        >
          <PhoneCall className="h-4 w-4" />
          +91 78999 10288
        </a>
        <a
          href="mailto:support@feedbacknfc.com"
          className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700"
        >
          <Mail className="h-4 w-4" />
          support@feedbacknfc.com
        </a>
      </div>
    </NfcPublicShell>
  );
}
