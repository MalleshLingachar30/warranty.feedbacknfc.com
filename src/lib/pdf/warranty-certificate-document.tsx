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

interface WarrantyCertificateDocumentProps {
  certificateNumber: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  productName: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  customerName?: string | null;
  warrantyStartDate: string;
  warrantyEndDate: string;
  stickerNumber: number;
  nfcUrl: string;
  qrDataUrl: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 12,
  },
  titleWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxWidth: "72%",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 10,
    color: "#475569",
  },
  logo: {
    width: 88,
    height: 44,
    objectFit: "contain",
  },
  section: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 5,
  },
  label: {
    width: "42%",
    color: "#475569",
  },
  value: {
    width: "58%",
    fontWeight: 600,
  },
  certificateNumber: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1d4ed8",
  },
  qrWrap: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qrImage: {
    width: 94,
    height: 94,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
  },
  qrText: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxWidth: "70%",
  },
  footnote: {
    marginTop: 10,
    fontSize: 9,
    color: "#64748b",
  },
});

export function WarrantyCertificateDocument({
  certificateNumber,
  organizationName,
  organizationLogoUrl,
  productName,
  modelNumber,
  serialNumber,
  customerName,
  warrantyStartDate,
  warrantyEndDate,
  stickerNumber,
  nfcUrl,
  qrDataUrl,
}: WarrantyCertificateDocumentProps) {
  return (
    <Document title={`Warranty Certificate ${certificateNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Warranty Certificate</Text>
            <Text style={styles.subtitle}>{organizationName}</Text>
            <Text style={styles.certificateNumber}>{certificateNumber}</Text>
          </View>
          {organizationLogoUrl ? (
            <PdfImage src={organizationLogoUrl} style={styles.logo} />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Product</Text>
            <Text style={styles.value}>{productName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Model Number</Text>
            <Text style={styles.value}>{modelNumber ?? "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Serial Number</Text>
            <Text style={styles.value}>{serialNumber ?? "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Sticker Number</Text>
            <Text style={styles.value}>{stickerNumber}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Warranty Coverage</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{customerName ?? "Customer"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Warranty Start Date</Text>
            <Text style={styles.value}>{warrantyStartDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Warranty End Date</Text>
            <Text style={styles.value}>{warrantyEndDate}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scan for Service</Text>
          <View style={styles.qrWrap}>
            <PdfImage src={qrDataUrl} style={styles.qrImage} />
            <View style={styles.qrText}>
              <Text>Tap/scan this QR to open the product service page.</Text>
              <Text>{nfcUrl}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footnote}>
          This certificate is system-generated and linked to the NFC sticker
          identity. Keep this copy for future claim verification.
        </Text>
      </Page>
    </Document>
  );
}

export function createWarrantyCertificatePdfDocument(
  props: WarrantyCertificateDocumentProps,
): ReactElement<DocumentProps> {
  return <WarrantyCertificateDocument {...props} />;
}
