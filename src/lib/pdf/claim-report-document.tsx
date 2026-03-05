import {
  Document,
  type DocumentProps,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { type ReactElement } from "react";

interface ClaimReportPartLine {
  partName: string;
  partNumber: string;
  quantity: number;
  cost: number;
  lineTotal: number;
}

interface ClaimReportTimelineLine {
  label: string;
  at: string;
}

interface ClaimReportDocumentProps {
  claimNumber: string;
  ticketNumber: string;
  manufacturerName: string;
  serviceCenterName: string;
  productName: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  issueCategory?: string | null;
  issueDescription: string;
  technicianName?: string | null;
  technicianPhone?: string | null;
  technicianNotes?: string | null;
  parts: ClaimReportPartLine[];
  laborHours: number;
  laborCost: number;
  partsCost: number;
  totalClaimAmount: number;
  timestamps: ClaimReportTimelineLine[];
  photoUrls: string[];
  generatedAt: string;
}

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  subtitle: {
    marginTop: 2,
    color: "#475569",
  },
  section: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 3,
  },
  label: {
    width: "42%",
    color: "#64748b",
  },
  value: {
    width: "58%",
    fontWeight: 600,
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: 700,
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 3,
  },
  colPart: { width: "40%" },
  colQty: { width: "15%" },
  colCost: { width: "20%" },
  colTotal: { width: "25%", textAlign: "right" },
  timelineItem: {
    marginBottom: 4,
  },
  timelineLabel: {
    fontWeight: 700,
  },
  photoGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  photo: {
    width: 82,
    height: 82,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    objectFit: "cover",
  },
  footer: {
    marginTop: 6,
    color: "#64748b",
    fontSize: 9,
  },
});

export function ClaimReportDocument({
  claimNumber,
  ticketNumber,
  manufacturerName,
  serviceCenterName,
  productName,
  modelNumber,
  serialNumber,
  customerName,
  customerPhone,
  customerAddress,
  issueCategory,
  issueDescription,
  technicianName,
  technicianPhone,
  technicianNotes,
  parts,
  laborHours,
  laborCost,
  partsCost,
  totalClaimAmount,
  timestamps,
  photoUrls,
  generatedAt,
}: ClaimReportDocumentProps) {
  return (
    <Document title={`Claim Report ${claimNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Warranty Claim Report</Text>
          <Text style={styles.subtitle}>
            {claimNumber} • Ticket {ticketNumber}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Claim Overview</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Manufacturer</Text>
            <Text style={styles.value}>{manufacturerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Service Center</Text>
            <Text style={styles.value}>{serviceCenterName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Generated At</Text>
            <Text style={styles.value}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product & Customer</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Product</Text>
            <Text style={styles.value}>{productName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Model</Text>
            <Text style={styles.value}>{modelNumber ?? "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Serial</Text>
            <Text style={styles.value}>{serialNumber ?? "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{customerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer Phone</Text>
            <Text style={styles.value}>{customerPhone}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer Address</Text>
            <Text style={styles.value}>
              {customerAddress && customerAddress.trim().length > 0
                ? customerAddress
                : "Not available"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issue & Resolution</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Issue Category</Text>
            <Text style={styles.value}>{issueCategory ?? "General issue"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Issue Description</Text>
            <Text style={styles.value}>{issueDescription}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Technician</Text>
            <Text style={styles.value}>
              {technicianName ?? "Unassigned"}
              {technicianPhone ? ` (${technicianPhone})` : ""}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Technician Notes</Text>
            <Text style={styles.value}>
              {technicianNotes && technicianNotes.trim().length > 0
                ? technicianNotes
                : "No notes provided"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parts & Labor</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colPart}>Part</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colCost}>Unit Cost</Text>
            <Text style={styles.colTotal}>Line Total</Text>
          </View>
          {parts.length > 0 ? (
            parts.map((part, index) => (
              <View key={`${part.partName}-${index}`} style={styles.tableRow}>
                <Text style={styles.colPart}>
                  {part.partName}
                  {part.partNumber ? ` (${part.partNumber})` : ""}
                </Text>
                <Text style={styles.colQty}>{part.quantity}</Text>
                <Text style={styles.colCost}>{money.format(part.cost)}</Text>
                <Text style={styles.colTotal}>
                  {money.format(part.lineTotal)}
                </Text>
              </View>
            ))
          ) : (
            <Text>No parts listed.</Text>
          )}
          <View style={{ marginTop: 8 }}>
            <Text>Labor Hours: {laborHours.toFixed(2)}</Text>
            <Text>Parts Cost: {money.format(partsCost)}</Text>
            <Text>Labor Cost: {money.format(laborCost)}</Text>
            <Text style={{ fontWeight: 700 }}>
              Total Claim Amount: {money.format(totalClaimAmount)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {timestamps.length > 0 ? (
            timestamps.map((entry, index) => (
              <View key={`${entry.label}-${entry.at}-${index}`} style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>{entry.label}</Text>
                <Text>{entry.at}</Text>
              </View>
            ))
          ) : (
            <Text>No timeline entries available.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {photoUrls.length > 0 ? (
            <View style={styles.photoGrid}>
              {photoUrls.slice(0, 6).map((photoUrl, index) => (
                <PdfImage
                  key={`${photoUrl}-${index}`}
                  src={photoUrl}
                  style={styles.photo}
                />
              ))}
            </View>
          ) : (
            <Text>No photos attached.</Text>
          )}
        </View>

        <Text style={styles.footer}>
          System-generated claim report for manufacturer review and audit trail.
        </Text>
      </Page>
    </Document>
  );
}

export function createClaimReportPdfDocument(
  props: ClaimReportDocumentProps,
): ReactElement<DocumentProps> {
  return <ClaimReportDocument {...props} />;
}
