import { notFound } from "next/navigation";

import { CustomerInstallationReportAuthorizationClient } from "@/components/installation-reports/customer-authorization-client";
import { db } from "@/lib/db";
import {
  buildInstallationReportAuthorizationUrl,
  buildInstallationReportPdfUrl,
} from "@/lib/installation-report-links";
import {
  buildInstallationGeoLocationUrl,
  formatInstallationGeoLocationLabel,
  formatInstallationReportDate,
  formatInstallationReportDateTime,
  installationReportAuthorizationSelect,
} from "@/lib/installation-report-view";

export const runtime = "nodejs";

export default async function InstallationReportAuthorizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  const report = await db.installationReport.findUnique({
    where: {
      id,
    },
    select: installationReportAuthorizationSelect,
  });

  if (!report) {
    notFound();
  }

  const linkedProduct = await db.product.findFirst({
    where: {
      organizationId: report.installationJob.manufacturerOrgId,
      productModelId: report.asset.productModelId,
      serialNumber: report.unitSerialNumber,
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (!linkedProduct) {
    notFound();
  }

  const metadata =
    linkedProduct.metadata && typeof linkedProduct.metadata === "object"
      ? (linkedProduct.metadata as Record<string, unknown>)
      : {};

  const certificateUrl =
    typeof metadata.warrantyCertificateUrl === "string"
      ? metadata.warrantyCertificateUrl
      : null;

  return (
    <CustomerInstallationReportAuthorizationClient
      reportId={report.id}
      productId={linkedProduct.id}
      productName={report.asset.productModel.name}
      modelNumber={report.asset.productModel.modelNumber}
      assetCode={report.asset.publicCode}
      unitSerialNumber={report.unitSerialNumber}
      customerName={report.customerName}
      customerPhone={report.customerPhone}
      installationDateLabel={formatInstallationReportDate(
        report.installationDate,
      )}
      geoLocationLabel={formatInstallationGeoLocationLabel(report.geoLocation)}
      geoLocationUrl={buildInstallationGeoLocationUrl(report.geoLocation)}
      submittedAtLabel={formatInstallationReportDateTime(report.submittedAt)}
      pdfUrl={buildInstallationReportPdfUrl(report.id)}
      authorizationUrl={buildInstallationReportAuthorizationUrl(report.id)}
      customerAuthorizedAt={
        report.customerAuthorizedAt
          ? formatInstallationReportDateTime(report.customerAuthorizedAt)
          : null
      }
      customerAuthorizedByName={report.customerAuthorizedByName}
      certificateUrl={certificateUrl}
    />
  );
}
