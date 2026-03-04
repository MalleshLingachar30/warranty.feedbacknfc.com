import { Factory, Link2Off } from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { StickerView } from "@/components/nfc/types";

interface StickerNotBoundProps {
  sticker: StickerView;
}

export function StickerNotBound({ sticker }: StickerNotBoundProps) {
  return (
    <NfcPublicShell
      title="Awaiting Product Assignment"
      description="This sticker is allocated but not yet bound to a product unit."
      footer="Share the sticker details below with your installation partner for faster support."
    >
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <div className="flex items-center gap-2 text-slate-900">
          <Link2Off className="h-4 w-4" />
          <p className="font-medium">Sticker #{sticker.stickerNumber}</p>
        </div>
        <p>Serial: {sticker.stickerSerial ?? "Not available"}</p>
        <div className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-blue-700" />
          <p>
            Manufacturer: <span className="font-medium">{sticker.organizationName ?? "Unknown"}</span>
          </p>
        </div>
      </div>
    </NfcPublicShell>
  );
}
