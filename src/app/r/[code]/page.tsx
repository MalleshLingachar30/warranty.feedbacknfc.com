import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { formatProductClassLabel } from "@/lib/asset-generation";
import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { formatWorkflowLabel } from "@/lib/installation-workflow";
import {
  buildPartScanQueryString,
  type PartScanPayload,
} from "@/lib/part-scan-handoff";
import { parseAppRole, parseAppRoleFromClaims, type AppRole } from "@/lib/roles";

type ResolverPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ResolverViewerRole = AppRole | "anonymous_customer";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return first ?? null;
  }

  return null;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toSearchParamString(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      nextSearchParams.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          nextSearchParams.append(key, entry);
        }
      }
    }
  }

  const serialized = nextSearchParams.toString();
  return serialized ? `?${serialized}` : "";
}

function formatTagClassLabel(tagClass: string) {
  switch (tagClass) {
    case "unit_service":
      return "Unit Service";
    case "carton_registration":
      return "Carton Registration";
    case "component_unit":
      return "Component Unit";
    case "small_part_batch":
      return "Small Part Batch";
    case "kit_parent":
      return "Kit Parent";
    case "pack_parent":
      return "Pack Parent";
    default:
      return tagClass;
  }
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return value.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isStaffRole(role: ResolverViewerRole) {
  return (
    role === "technician" ||
    role === "service_center_admin" ||
    role === "manufacturer_admin" ||
    role === "super_admin"
  );
}

function isInstallationPendingLifecycle(lifecycleState: string) {
  return (
    lifecycleState === "sold_pending_installation" ||
    lifecycleState === "installation_scheduled" ||
    lifecycleState === "installation_in_progress"
  );
}

function buildNfcPath(input: {
  stickerNumber: number;
  tagClass: string;
  scanSource: string | null;
}) {
  const params = new URLSearchParams();
  if (input.scanSource === "qr" || input.scanSource === "nfc") {
    params.set("src", input.scanSource);
  }

  params.set("ctx", input.tagClass === "carton_registration" ? "carton" : "product");
  const serialized = params.toString();
  return `/nfc/${encodeURIComponent(String(input.stickerNumber))}${serialized ? `?${serialized}` : ""}`;
}

async function resolveViewer() {
  const authData = await getOptionalAuth();
  if (!authData.userId) {
    return {
      userId: null,
      role: "anonymous_customer" as ResolverViewerRole,
      organizationId: null as string | null,
    };
  }

  const dbUser = await db.user.findUnique({
    where: {
      clerkId: authData.userId,
    },
    select: {
      role: true,
      organizationId: true,
    },
  });

  const claimsRole = parseAppRoleFromClaims(authData.sessionClaims);
  const role =
    claimsRole === "customer" && dbUser?.role && dbUser.role !== "customer"
      ? parseAppRole(dbUser.role)
      : claimsRole;

  return {
    userId: authData.userId,
    role,
    organizationId: dbUser?.organizationId ?? null,
  };
}

function ResolverShell(props: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {props.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{props.description}</p>
        {props.children ? <div className="mt-5">{props.children}</div> : null}
      </section>
    </main>
  );
}

export default async function TagResolverPage({
  params,
  searchParams,
}: ResolverPageProps) {
  const { code } = await params;
  const resolvedSearchParams = await searchParams;
  const queryString = toSearchParamString(resolvedSearchParams);
  const scanSourceRaw = firstQueryValue(resolvedSearchParams.src);
  const scanSource =
    scanSourceRaw === "qr" || scanSourceRaw === "nfc" ? scanSourceRaw : null;
  const ticketContext = asString(firstQueryValue(resolvedSearchParams.ticket));
  const installationJobContext = asString(firstQueryValue(resolvedSearchParams.job));
  const stickerContext = parsePositiveInteger(
    firstQueryValue(resolvedSearchParams.sticker),
  );

  const lookupCode = code.trim();

  if (!lookupCode) {
    return (
      <ResolverShell
        title="Invalid tag code"
        description="The scanned resolver link is missing a valid tag code."
      />
    );
  }

  const normalizedCandidate =
    lookupCode === lookupCode.toUpperCase() ? null : lookupCode.toUpperCase();

  const resolvedTag =
    (await db.assetTag.findUnique({
      where: {
        publicCode: lookupCode,
      },
      select: {
        id: true,
        publicCode: true,
        tagClass: true,
        symbology: true,
        status: true,
        viewerPolicy: true,
        asset: {
          select: {
            id: true,
            publicCode: true,
            organizationId: true,
            serialNumber: true,
            productClass: true,
            lifecycleState: true,
            warrantyState: true,
            metadata: true,
            organization: {
              select: {
                name: true,
              },
            },
            productModel: {
              select: {
                id: true,
                name: true,
                modelNumber: true,
                activationMode: true,
                installationRequired: true,
                partTraceabilityMode: true,
                smallPartTrackingMode: true,
              },
            },
            saleRegistration: {
              select: {
                id: true,
                status: true,
                channel: true,
                registeredAt: true,
                installationJob: {
                  select: {
                    id: true,
                    jobNumber: true,
                    status: true,
                    scheduledFor: true,
                    activationTriggeredAt: true,
                  },
                },
              },
            },
            installationJobs: {
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
              select: {
                id: true,
                jobNumber: true,
                status: true,
                scheduledFor: true,
                activationTriggeredAt: true,
              },
            },
          },
        },
      },
    })) ??
    (normalizedCandidate
      ? await db.assetTag.findUnique({
          where: {
            publicCode: normalizedCandidate,
          },
          select: {
            id: true,
            publicCode: true,
            tagClass: true,
            symbology: true,
            status: true,
            viewerPolicy: true,
            asset: {
              select: {
                id: true,
                publicCode: true,
                organizationId: true,
                serialNumber: true,
                productClass: true,
                lifecycleState: true,
                warrantyState: true,
                metadata: true,
                organization: {
                  select: {
                    name: true,
                  },
                },
                productModel: {
                  select: {
                    id: true,
                    name: true,
                    modelNumber: true,
                    activationMode: true,
                    installationRequired: true,
                    partTraceabilityMode: true,
                    smallPartTrackingMode: true,
                  },
                },
                saleRegistration: {
                  select: {
                    id: true,
                    status: true,
                    channel: true,
                    registeredAt: true,
                    installationJob: {
                      select: {
                        id: true,
                        jobNumber: true,
                        status: true,
                        scheduledFor: true,
                        activationTriggeredAt: true,
                      },
                    },
                  },
                },
                installationJobs: {
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                  select: {
                    id: true,
                    jobNumber: true,
                    status: true,
                    scheduledFor: true,
                    activationTriggeredAt: true,
                  },
                },
              },
            },
          },
        })
      : null);

  if (!resolvedTag) {
    return (
      <ResolverShell
        title="Tag not found"
        description={`No generated tag was found for code ${lookupCode}.`}
      />
    );
  }

  if (resolvedTag.status === "voided") {
    return (
      <ResolverShell
        title="Tag is voided"
        description={`Tag ${resolvedTag.publicCode} is marked voided and cannot be used for scan workflows.`}
      />
    );
  }

  const viewer = await resolveViewer();
  const staffForAssetOrg =
    isStaffRole(viewer.role) &&
    viewer.organizationId !== null &&
    viewer.organizationId === resolvedTag.asset.organizationId;

  const currentResolverPath = `/r/${encodeURIComponent(resolvedTag.publicCode)}${queryString}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(currentResolverPath)}`;

  if (
    (resolvedTag.viewerPolicy === "technician_admin" ||
      resolvedTag.viewerPolicy === "warehouse_admin") &&
    !staffForAssetOrg
  ) {
    return (
      <ResolverShell
        title="Authenticated staff access required"
        description="This tag is restricted to authorized technician/admin viewers from the owning organization."
      >
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            Tag: <span className="font-medium text-slate-900">{resolvedTag.publicCode}</span>
          </p>
          <p>
            Viewer policy:{" "}
            <span className="font-medium text-slate-900">{resolvedTag.viewerPolicy}</span>
          </p>
          <Link
            href={signInHref}
            className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
          >
            Sign in to continue
          </Link>
        </div>
      </ResolverShell>
    );
  }

  const isMainAsset = resolvedTag.asset.productClass === "main_product";

  const linkedProduct =
    isMainAsset && resolvedTag.asset.serialNumber
      ? await db.product.findFirst({
          where: {
            organizationId: resolvedTag.asset.organizationId,
            productModelId: resolvedTag.asset.productModel.id,
            serialNumber: resolvedTag.asset.serialNumber,
          },
          select: {
            id: true,
            warrantyStatus: true,
            sticker: {
              select: {
                stickerNumber: true,
              },
            },
          },
        })
      : null;

  if (isMainAsset && linkedProduct?.sticker?.stickerNumber) {
    const shouldFollowNfcFlow =
      linkedProduct.warrantyStatus !== "pending_activation" ||
      resolvedTag.asset.productModel.activationMode !== "installation_driven";

    if (shouldFollowNfcFlow) {
      redirect(
        buildNfcPath({
          stickerNumber: linkedProduct.sticker.stickerNumber,
          tagClass: resolvedTag.tagClass,
          scanSource,
        }),
      );
    }
  }

  if (isMainAsset) {
    const isInstallationDriven =
      resolvedTag.asset.productModel.activationMode === "installation_driven" ||
      resolvedTag.asset.productModel.installationRequired;

    const installationJob =
      resolvedTag.asset.saleRegistration?.installationJob ??
      resolvedTag.asset.installationJobs[0] ??
      null;

    if (
      isInstallationDriven &&
      (resolvedTag.asset.lifecycleState === "generated" ||
        resolvedTag.asset.lifecycleState === "packed")
    ) {
      return (
        <ResolverShell
          title="Sale registration required"
          description="This installation-driven product tag is valid, but commercial handoff must be registered before installation can start."
        >
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Tag: <span className="font-medium text-slate-900">{resolvedTag.publicCode}</span>
            </p>
            <p>
              Asset:{" "}
              <span className="font-medium text-slate-900">{resolvedTag.asset.publicCode}</span>
            </p>
            <p>
              Tag class:{" "}
              <span className="font-medium text-slate-900">
                {formatTagClassLabel(resolvedTag.tagClass)}
              </span>
            </p>
            <p>
              Lifecycle:{" "}
              <span className="font-medium text-slate-900">
                {formatWorkflowLabel(resolvedTag.asset.lifecycleState)}
              </span>
            </p>
            <p>
              Product model:{" "}
              <span className="font-medium text-slate-900">
                {resolvedTag.asset.productModel.name}
              </span>
            </p>
            {staffForAssetOrg &&
            (viewer.role === "manufacturer_admin" || viewer.role === "super_admin") ? (
              <div className="pt-2">
                <Link
                  href={`/dashboard/manufacturer/sales?lookup=${encodeURIComponent(
                    resolvedTag.publicCode,
                  )}`}
                  className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
                >
                  Open Sale Registration
                </Link>
              </div>
            ) : (
              <div className="pt-2">
                <p className="mb-2">
                  Sign in as a manufacturer admin and register this code in Sales.
                </p>
                <Link
                  href={signInHref}
                  className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </ResolverShell>
      );
    }

    if (
      isInstallationDriven &&
      (isInstallationPendingLifecycle(resolvedTag.asset.lifecycleState) ||
        Boolean(resolvedTag.asset.saleRegistration) ||
        Boolean(installationJob))
    ) {
      return (
        <ResolverShell
          title="Installation is pending"
          description="Sale is registered for this asset. Warranty activation will happen only after installation report submission."
        >
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Tag: <span className="font-medium text-slate-900">{resolvedTag.publicCode}</span>
            </p>
            <p>
              Asset:{" "}
              <span className="font-medium text-slate-900">{resolvedTag.asset.publicCode}</span>
            </p>
            <p>
              Lifecycle:{" "}
              <span className="font-medium text-slate-900">
                {formatWorkflowLabel(resolvedTag.asset.lifecycleState)}
              </span>
            </p>
            {resolvedTag.asset.saleRegistration ? (
              <p>
                Sale registration:{" "}
                <span className="font-medium text-slate-900">
                  {formatWorkflowLabel(resolvedTag.asset.saleRegistration.status)}
                </span>{" "}
                ({formatWorkflowLabel(resolvedTag.asset.saleRegistration.channel)})
              </p>
            ) : null}
            {installationJob ? (
              <>
                <p>
                  Installation job:{" "}
                  <span className="font-medium text-slate-900">
                    {installationJob.jobNumber}
                  </span>
                </p>
                <p>
                  Job status:{" "}
                  <span className="font-medium text-slate-900">
                    {formatWorkflowLabel(installationJob.status)}
                  </span>
                </p>
                <p>
                  Scheduled for:{" "}
                  <span className="font-medium text-slate-900">
                    {formatDateTime(installationJob.scheduledFor)}
                  </span>
                </p>
              </>
            ) : null}

            {staffForAssetOrg ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {viewer.role === "technician" ? (
                  <Link
                    href="/dashboard/my-jobs"
                    className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
                  >
                    Open My Jobs
                  </Link>
                ) : null}
                {viewer.role === "manufacturer_admin" || viewer.role === "super_admin" ? (
                  <Link
                    href="/dashboard/manufacturer/installations"
                    className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
                  >
                    Open Installation Queue
                  </Link>
                ) : null}
                {viewer.role === "service_center_admin" ? (
                  <Link
                    href="/dashboard/tickets"
                    className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
                  >
                    Open Service Center Queue
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </ResolverShell>
      );
    }

    if (linkedProduct?.sticker?.stickerNumber) {
      redirect(
        buildNfcPath({
          stickerNumber: linkedProduct.sticker.stickerNumber,
          tagClass: resolvedTag.tagClass,
          scanSource,
        }),
      );
    }

    return (
      <ResolverShell
        title="Customer warranty surface missing"
        description="This main-product tag resolved successfully, but no scannable customer warranty record is linked yet."
      >
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            Tag: <span className="font-medium">{resolvedTag.publicCode}</span>
          </p>
          <p>
            Asset: <span className="font-medium">{resolvedTag.asset.publicCode}</span>
          </p>
          <p>
            Lifecycle:{" "}
            <span className="font-medium">
              {formatWorkflowLabel(resolvedTag.asset.lifecycleState)}
            </span>
          </p>
          <p>
            Link/create the customer-facing product sticker record before using this
            tag for customer scan journeys.
          </p>
        </div>
      </ResolverShell>
    );
  }

  if (!staffForAssetOrg) {
    const signedInStaffFromOtherOrg =
      viewer.userId &&
      isStaffRole(viewer.role) &&
      viewer.organizationId &&
      viewer.organizationId !== resolvedTag.asset.organizationId;

    if (signedInStaffFromOtherOrg) {
      return (
        <ResolverShell
          title="Wrong manufacturer context"
          description="This scanned part tag belongs to another manufacturer organization and cannot be linked in your current staff context."
        >
          <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p>
              Tag:{" "}
              <span className="font-medium text-rose-900">{resolvedTag.publicCode}</span>
            </p>
            <p>
              Owning organization:{" "}
              <span className="font-medium text-rose-900">
                {resolvedTag.asset.organization.name}
              </span>
            </p>
            <p>
              Your signed-in staff org does not match this part tag. Sign into the
              correct manufacturer/service-center context and scan again.
            </p>
          </div>
        </ResolverShell>
      );
    }

    return (
      <ResolverShell
        title="Staff workflow sign-in required"
        description="This spare/kit/pack tag resolves correctly, but part usage capture is restricted to authenticated staff in the owning organization."
      >
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            Tag: <span className="font-medium text-slate-900">{resolvedTag.publicCode}</span>
          </p>
          <p>
            Product class:{" "}
            <span className="font-medium text-slate-900">
              {formatProductClassLabel(resolvedTag.asset.productClass)}
            </span>
          </p>
          <Link
            href={signInHref}
            className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
          >
            Sign in to continue
          </Link>
        </div>
      </ResolverShell>
    );
  }

  const metadata = asRecord(resolvedTag.asset.metadata);
  const partName = asString(metadata.partName) ?? asString(metadata.name);
  const partNumber =
    asString(metadata.partNumber) ??
    asString(metadata.partCode) ??
    asString(metadata.itemCode);
  const batchCode = asString(metadata.batchCode);
  const supportedAssetClass =
    resolvedTag.asset.productClass === "spare_part" ||
    resolvedTag.asset.productClass === "small_part" ||
    resolvedTag.asset.productClass === "kit" ||
    resolvedTag.asset.productClass === "pack";
  const supportedTagClass =
    resolvedTag.tagClass === "component_unit" ||
    resolvedTag.tagClass === "small_part_batch" ||
    resolvedTag.tagClass === "kit_parent" ||
    resolvedTag.tagClass === "pack_parent";

  if (!supportedAssetClass || !supportedTagClass) {
    return (
      <ResolverShell
        title="Unsupported tag class for part capture"
        description="This resolved tag cannot be used for technician part-usage linking."
      >
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>
            Tag:{" "}
            <span className="font-medium text-rose-900">{resolvedTag.publicCode}</span>
          </p>
          <p>
            Tag class:{" "}
            <span className="font-medium text-rose-900">
              {formatTagClassLabel(resolvedTag.tagClass)}
            </span>
          </p>
          <p>
            Product class:{" "}
            <span className="font-medium text-rose-900">
              {formatProductClassLabel(resolvedTag.asset.productClass)}
            </span>
          </p>
          <p>
            Only component-unit, small-part-batch, kit-parent, and pack-parent
            generated tags can be linked as part usage.
          </p>
        </div>
      </ResolverShell>
    );
  }

  const partAssetClass =
    resolvedTag.asset.productClass as PartScanPayload["assetClass"];
  const partTagClass = resolvedTag.tagClass as PartScanPayload["tagClass"];
  const partScanPayload: PartScanPayload = {
    assetCode: resolvedTag.asset.publicCode,
    tagCode: resolvedTag.publicCode,
    assetClass: partAssetClass,
    tagClass: partTagClass,
    organizationId: resolvedTag.asset.organizationId,
    partName,
    partNumber,
    batchCode,
    resolverCode: resolvedTag.publicCode,
  };

  const serviceWorkflowQuery = buildPartScanQueryString({
    scan: partScanPayload,
    context: {
      ticketId: ticketContext,
      stickerNumber: stickerContext,
    },
  });
  const installationWorkflowQuery = buildPartScanQueryString({
    scan: partScanPayload,
    context: {
      installationJobId: installationJobContext,
      ticketId: ticketContext,
      stickerNumber: stickerContext,
    },
  });
  const nfcWorkflowQuery = buildPartScanQueryString({
    scan: partScanPayload,
    context: {
      ticketId: ticketContext,
      installationJobId: installationJobContext,
      stickerNumber: stickerContext,
    },
  });
  const missingWorkflowContext =
    !ticketContext && !installationJobContext && !stickerContext;

  return (
    <ResolverShell
      title="Part tag resolved"
      description="Use these resolved values in installation or service part-usage capture. This tag is now scan-operational for technician/admin workflows."
    >
      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Tag Code
            </p>
            <input
              readOnly
              value={resolvedTag.publicCode}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Asset Code
            </p>
            <input
              readOnly
              value={resolvedTag.asset.publicCode}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        <div className="space-y-1">
          <p>
            Product class:{" "}
            <span className="font-medium text-slate-900">
              {formatProductClassLabel(resolvedTag.asset.productClass)}
            </span>
          </p>
          <p>
            Tag class:{" "}
            <span className="font-medium text-slate-900">
              {formatTagClassLabel(resolvedTag.tagClass)}
            </span>
          </p>
          <p>
            Viewer policy:{" "}
            <span className="font-medium text-slate-900">{resolvedTag.viewerPolicy}</span>
          </p>
          <p>
            Organization:{" "}
            <span className="font-medium text-slate-900">
              {resolvedTag.asset.organization.name}
            </span>
          </p>
          {resolvedTag.asset.serialNumber ? (
            <p>
              Serial number:{" "}
              <span className="font-medium text-slate-900">
                {resolvedTag.asset.serialNumber}
              </span>
            </p>
          ) : null}
          {partName ? (
            <p>
              Part name: <span className="font-medium text-slate-900">{partName}</span>
            </p>
          ) : null}
          {partNumber ? (
            <p>
              Part number:{" "}
              <span className="font-medium text-slate-900">{partNumber}</span>
            </p>
          ) : null}
          {batchCode ? (
            <p>
              Batch code:{" "}
              <span className="font-medium text-slate-900">{batchCode}</span>
            </p>
          ) : null}
        </div>

        {missingWorkflowContext ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No active ticket/job context was provided with this scan. Choose the
            workflow below, then open the current job and submit from there.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {viewer.role === "technician" ? (
            <>
              <Link
                href={`/dashboard/my-jobs?tab=service&${serviceWorkflowQuery}`}
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
              >
                Add To Service Job
              </Link>
              <Link
                href={`/dashboard/my-jobs?tab=installation&${installationWorkflowQuery}`}
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
              >
                Add To Installation Job
              </Link>
              {stickerContext ? (
                <Link
                  href={`/nfc/${encodeURIComponent(String(stickerContext))}?${nfcWorkflowQuery}`}
                  className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100"
                >
                  Return To NFC Ticket
                </Link>
              ) : null}
            </>
          ) : null}
          {viewer.role === "service_center_admin" ? (
            <Link
              href="/dashboard/tickets"
              className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
            >
              Open Service Tickets
            </Link>
          ) : null}
          {viewer.role === "manufacturer_admin" || viewer.role === "super_admin" ? (
            <>
              <Link
                href="/dashboard/manufacturer/installations"
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
              >
                Open Installations
              </Link>
              <Link
                href="/dashboard/manufacturer/tickets"
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700"
              >
                Open Service Tickets
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </ResolverShell>
  );
}
