import { CustomerProductView } from "@/components/nfc/customer-product-view";
import { StickerNotBound } from "@/components/nfc/sticker-not-bound";
import { StickerNotFound } from "@/components/nfc/sticker-not-found";
import { UnregisteredSticker } from "@/components/nfc/unregistered-sticker";
import { getStickerLookup } from "@/lib/warranty-store";

interface NfcStickerPageProps {
  params: Promise<{ id: string }>;
}

export default async function NfcStickerPage({ params }: NfcStickerPageProps) {
  const { id } = await params;
  const stickerNumber = Number.parseInt(id, 10);

  if (!Number.isFinite(stickerNumber)) {
    return <StickerNotFound />;
  }

  const payload = getStickerLookup(stickerNumber);

  if (!payload.sticker) {
    return <StickerNotFound />;
  }

  if (payload.sticker.status === "unregistered") {
    return <UnregisteredSticker />;
  }

  if (!payload.product) {
    return (
      <StickerNotBound
        sticker={{
          id: payload.sticker.id,
          stickerNumber: payload.sticker.stickerNumber,
          stickerSerial: payload.sticker.stickerSerial,
          status: payload.sticker.status,
          allocatedToOrg: null,
          organizationName: payload.sticker.organizationName,
        }}
      />
    );
  }

  if (!payload.productModel) {
    return <StickerNotFound />;
  }

  return (
    <CustomerProductView
      stickerNumber={payload.sticker.stickerNumber}
      product={payload.product}
      productModel={payload.productModel}
      openTicket={payload.openTicket}
      serviceHistory={payload.serviceHistory}
    />
  );
}
