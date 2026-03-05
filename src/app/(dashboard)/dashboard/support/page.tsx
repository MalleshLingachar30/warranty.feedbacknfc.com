import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/lib/db";
import { requireCustomerContext } from "@/lib/customer-context";

export default async function SupportPage() {
  const { dbUserId, verifiedEmails, verifiedPhones } =
    await requireCustomerContext();

  const customerFilters = [
    { customerId: dbUserId },
    ...(verifiedPhones.length > 0 ? [{ customerPhone: { in: verifiedPhones } }] : []),
    ...(verifiedEmails.length > 0 ? [{ customerEmail: { in: verifiedEmails } }] : []),
  ];

  const products = await db.product.findMany({
    where: {
      OR: customerFilters,
    },
    take: 200,
    select: {
      id: true,
      organization: {
        select: {
          id: true,
          name: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
      productModel: {
        select: {
          name: true,
        },
      },
    },
  });

  const manufacturers = new Map<
    string,
    {
      id: string;
      name: string;
      contactEmail: string;
      contactPhone: string;
      productNames: Set<string>;
    }
  >();

  for (const product of products) {
    const org = product.organization;
    const existing = manufacturers.get(org.id) ?? {
      id: org.id,
      name: org.name,
      contactEmail: org.contactEmail ?? "",
      contactPhone: org.contactPhone ?? "",
      productNames: new Set<string>(),
    };

    existing.productNames.add(product.productModel.name);
    manufacturers.set(org.id, existing);
  }

  const manufacturerRows = Array.from(manufacturers.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Contact manufacturers, find FAQs, and manage your warranty documents."
      />

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
          <CardDescription>
            Most support requests start from your product sticker page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/dashboard/my-products">Open my products</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/my-tickets">Track my tickets</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Contact manufacturers</CardTitle>
          <CardDescription>
            Support contacts are shown for manufacturers linked to your registered
            products.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {manufacturerRows.length === 0 ? (
            <p className="text-sm text-slate-600">
              No manufacturer contacts found yet. Activate a product warranty
              by scanning the sticker so we can show the correct support
              channels.
            </p>
          ) : (
            manufacturerRows.map((row) => (
              <div key={row.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {row.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Products: {Array.from(row.productNames).join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    {row.contactPhone ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={`tel:${row.contactPhone}`}>{row.contactPhone}</a>
                      </Button>
                    ) : null}
                    {row.contactEmail ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`mailto:${row.contactEmail}`}>{row.contactEmail}</a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Warranty documents</CardTitle>
          <CardDescription>
            Certificates and claim PDFs will appear here as they are generated.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <p>Document downloads are being enabled next.</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">FAQ</CardTitle>
          <CardDescription>Common questions about warranty support.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <div>
            <p className="font-medium text-slate-900">
              How do I request service?
            </p>
            <p className="mt-1 text-slate-600">
              Scan the QR code or tap the NFC sticker on your product, then use
              the “Report Issue” button.
            </p>
          </div>
          <Separator />
          <div>
            <p className="font-medium text-slate-900">
              How do I confirm a repair is complete?
            </p>
            <p className="mt-1 text-slate-600">
              Open the ticket in <Link className="text-indigo-600 underline" href="/dashboard/my-tickets">My Tickets</Link>{" "}
              and press “Confirm Resolution” when you are satisfied.
            </p>
          </div>
          <Separator />
          <div>
            <p className="font-medium text-slate-900">
              Why don’t I see my product here?
            </p>
            <p className="mt-1 text-slate-600">
              Your account needs a verified phone number or email, and the
              product must be activated via sticker scan.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
