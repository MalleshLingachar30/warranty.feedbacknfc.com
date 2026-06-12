import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";

export function buildInstallationReportPdfPath(reportId: string): string {
  return `/api/installation-reports/${reportId}/pdf`;
}

export function buildInstallationReportPdfUrl(reportId: string): string {
  return buildAbsoluteWarrantyUrl(buildInstallationReportPdfPath(reportId));
}

export function buildInstallationReportAuthorizationPath(
  reportId: string,
): string {
  return `/installation-reports/${reportId}/authorize`;
}

export function buildInstallationReportAuthorizationUrl(
  reportId: string,
): string {
  return buildAbsoluteWarrantyUrl(
    buildInstallationReportAuthorizationPath(reportId),
  );
}
