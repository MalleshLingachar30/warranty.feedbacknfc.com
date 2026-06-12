import {
  Document,
  type DocumentProps,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { type ReactElement } from "react";

interface InstallationReportPdfDocumentProps {
  reportNumber: string;
  organizationName: string;
  productName: string;
  modelNumber?: string | null;
  assetCode: string;
  unitSerialNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  installAddress: string;
  installCity: string;
  installState: string;
  installPincode: string;
  installationDate: string;
  geoLocationLabel?: string | null;
  geoLocationUrl?: string | null;
  installerName: string;
  submittedAt: string;
  submittedByRole: string;
  checklistResponses: Array<{ label: string; value: string }>;
  commissioningData: Array<{ label: string; value: string }>;
  authorizationStatusLabel: string;
  customerAuthorizedAt?: string | null;
  customerAuthorizedByName?: string | null;
  customerAuthorizedByPhone?: string | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: "#475569",
  },
  reportNumber: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#1d4ed8",
  },
  section: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 5,
  },
  label: {
    width: "38%",
    color: "#475569",
  },
  value: {
    width: "62%",
    fontWeight: 600,
  },
  grid: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
  },
  gridColumn: {
    width: "50%",
  },
  checklistRow: {
    marginBottom: 4,
  },
  checklistLabel: {
    fontWeight: 700,
  },
  footnote: {
    marginTop: 8,
    fontSize: 9,
    color: "#64748b",
  },
  link: {
    color: "#1d4ed8",
    textDecoration: "underline",
  },
});

function renderPairs(rows: Array<{ label: string; value: string }>) {
  if (rows.length === 0) {
    return <Text style={styles.footnote}>No entries captured.</Text>;
  }

  return rows.map((row) => (
    <View key={`${row.label}-${row.value}`} style={styles.checklistRow}>
      <Text>
        <Text style={styles.checklistLabel}>{row.label}: </Text>
        {row.value}
      </Text>
    </View>
  ));
}

export function InstallationReportPdfDocument(
  props: InstallationReportPdfDocumentProps,
) {
  return (
    <Document title={`Installation Report ${props.reportNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Digital Installation Report</Text>
          <Text style={styles.subtitle}>{props.organizationName}</Text>
          <Text style={styles.reportNumber}>{props.reportNumber}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipment</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Product</Text>
            <Text style={styles.value}>{props.productName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Model Number</Text>
            <Text style={styles.value}>{props.modelNumber ?? "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Asset Code</Text>
            <Text style={styles.value}>{props.assetCode}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Unit Serial Number</Text>
            <Text style={styles.value}>{props.unitSerialNumber}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer And Site</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Customer Name</Text>
            <Text style={styles.value}>{props.customerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer Phone</Text>
            <Text style={styles.value}>{props.customerPhone}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer Email</Text>
            <Text style={styles.value}>{props.customerEmail ?? "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Installation Date</Text>
            <Text style={styles.value}>{props.installationDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Installation Address</Text>
            <Text style={styles.value}>
              {props.installAddress}, {props.installCity}, {props.installState}{" "}
              {props.installPincode}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>GPS Coordinates</Text>
            <Text style={styles.value}>
              {props.geoLocationLabel ?? "Not captured"}
            </Text>
          </View>
          {props.geoLocationUrl ? (
            <View style={styles.row}>
              <Text style={styles.label}>Map Link</Text>
              <Link src={props.geoLocationUrl} style={[styles.value, styles.link]}>
                Open installation location
              </Link>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Execution Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Installer Name</Text>
            <Text style={styles.value}>{props.installerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Submitted At</Text>
            <Text style={styles.value}>{props.submittedAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Submitted By Role</Text>
            <Text style={styles.value}>{props.submittedByRole}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer Authorization</Text>
            <Text style={styles.value}>{props.authorizationStatusLabel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Authorized At</Text>
            <Text style={styles.value}>
              {props.customerAuthorizedAt ?? "Pending customer approval"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Authorized By</Text>
            <Text style={styles.value}>
              {props.customerAuthorizedByName
                ? `${props.customerAuthorizedByName}${
                    props.customerAuthorizedByPhone
                      ? ` (${props.customerAuthorizedByPhone})`
                      : ""
                  }`
                : "Pending customer approval"}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={[styles.section, styles.gridColumn]}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {renderPairs(props.checklistResponses)}
          </View>
          <View style={[styles.section, styles.gridColumn]}>
            <Text style={styles.sectionTitle}>Commissioning Data</Text>
            {renderPairs(props.commissioningData)}
          </View>
        </View>

        <Text style={styles.footnote}>
          This report is system-generated. Warranty activation occurs only after
          customer authorization is completed on the linked approval surface.
        </Text>
      </Page>
    </Document>
  );
}

export function createInstallationReportPdfDocument(
  props: InstallationReportPdfDocumentProps,
): ReactElement<DocumentProps> {
  return <InstallationReportPdfDocument {...props} />;
}
