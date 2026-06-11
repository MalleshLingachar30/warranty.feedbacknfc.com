import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";

const StickerWizardClient = dynamic(
  () =>
    import("@/components/manufacturer/sticker-wizard-client").then(
      (mod) => mod.StickerWizardClient,
    ),
  {
    loading: () => <ClientPageLoading rows={7} />,
  },
);

export default function ManufacturerStickersPage() {
  return <StickerWizardClient />;
}
