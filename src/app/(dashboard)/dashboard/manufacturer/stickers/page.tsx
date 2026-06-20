import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { ensureManufacturerWorkspaceAccess } from "@/lib/auth";

const StickerWizardClient = dynamic(
  () =>
    import("@/components/manufacturer/sticker-wizard-client").then(
      (mod) => mod.StickerWizardClient,
    ),
  {
    loading: () => <ClientPageLoading rows={7} />,
  },
);

export default async function ManufacturerStickersPage() {
  await ensureManufacturerWorkspaceAccess();

  return <StickerWizardClient />;
}
