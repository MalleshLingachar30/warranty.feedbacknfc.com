import { redirect } from "next/navigation";

export default async function CartonQrRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/nfc/${encodeURIComponent(id)}?src=qr&ctx=carton`);
}
