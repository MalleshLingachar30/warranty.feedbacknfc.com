import { redirect } from "next/navigation";

export default async function ProductQrRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/nfc/${encodeURIComponent(id)}?src=qr&ctx=product`);
}
