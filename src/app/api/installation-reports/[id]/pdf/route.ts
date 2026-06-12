import { renderToBuffer } from "@react-pdf/renderer";

import { db } from "@/lib/db";
import {
  buildInstallationGeoLocationUrl,
  buildInstallationReportNumber,
  formatInstallationGeoLocationLabel,
  formatInstallationReportDate,
  formatInstallationReportDateTime,
  installationReportAuthorizationSelect,
  jsonRecordToPairs,
} from "@/lib/installation-report-view";
import { createInstallationReportPdfDocument } from "@/lib/pdf/installation-report-document";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return new Response("Installation report id is required.", { status: 400 });
  }

  const report = await db.installationReport.findUnique({
    where: {
      id,
    },
    select: installationReportAuthorizationSelect,
  });

  if (!report) {
    return new Response("Installation report not found.", { status: 404 });
  }

  const reportNumber = buildInstallationReportNumber({
    submittedAt: report.submittedAt,
    reportId: report.id,
  });

  const pdfBuffer = await renderToBuffer(
    createInstallationReportPdfDocument({
      reportNumber,
      organizationName: report.installationJob.manufacturerOrg.name,
      productName: report.asset.productModel.name,
      modelNumber: report.asset.productModel.modelNumber,
      assetCode: report.asset.publicCode,
      unitSerialNumber: report.unitSerialNumber,
      customerName: report.customerName,
      customerPhone: report.customerPhone,
      customerEmail: report.customerEmail,
      installAddress: report.installAddress,
      installCity: report.installCity,
      installState: report.installState,
      installPincode: report.installPincode,
      installationDate: formatInstallationReportDate(report.installationDate),
      geoLocationLabel: formatInstallationGeoLocationLabel(report.geoLocation),
      geoLocationUrl: buildInstallationGeoLocationUrl(report.geoLocation),
      installerName: report.installerName,
      submittedAt: formatInstallationReportDateTime(report.submittedAt),
      submittedByRole: report.submittedByRole.replace(/_/g, " "),
      checklistResponses: jsonRecordToPairs(report.checklistResponses),
      commissioningData: jsonRecordToPairs(report.commissioningData),
      authorizationStatusLabel: report.customerAuthorizedAt
        ? "Customer authorized"
        : "Pending customer authorization",
      customerAuthorizedAt: report.customerAuthorizedAt
        ? formatInstallationReportDateTime(report.customerAuthorizedAt)
        : null,
      customerAuthorizedByName: report.customerAuthorizedByName,
      customerAuthorizedByPhone: report.customerAuthorizedByPhone,
    }),
  );

  const url = new URL(request.url);
  const asAttachment =
    url.searchParams.get("download") === "1" ||
    url.searchParams.get("download") === "true";
  const dispositionType = asAttachment ? "attachment" : "inline";
  const safeFileName = `${reportNumber}.pdf`;
  const responseBody = Uint8Array.from(pdfBuffer).buffer;

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dispositionType}; filename=\"${safeFileName}\"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
