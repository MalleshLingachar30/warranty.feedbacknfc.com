import { PackageSearch } from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";

export function UnregisteredSticker() {
  return (
    <NfcPublicShell
      title="Sticker Not Assigned Yet"
      description="This sticker has not been assigned to a product yet. Please contact the manufacturer or installer for assistance."
      footer="FeedbackNFC verifies every sticker against allocation records for safety."
    >
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-3">
          <PackageSearch className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-relaxed">
            The sticker is available in inventory, but product binding has not been
            completed yet.
          </p>
        </div>
      </div>
    </NfcPublicShell>
  );
}
