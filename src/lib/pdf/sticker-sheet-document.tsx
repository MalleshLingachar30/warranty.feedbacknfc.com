import {
  Document,
  type DocumentProps,
  Font,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { type ReactElement } from "react";

import { STICKER_FONT_PATHS } from "@/lib/sticker-label-fonts";
import { type StickerBrandingConfig } from "@/lib/sticker-config";

export type StickerSheetItem = {
  stickerNumber: number;
  stickerSerial: string;
  qrDataUrl: string;
};

Font.register({
  family: "StickerSans",
  src: STICKER_FONT_PATHS.sans,
});

Font.register({
  family: "StickerArabic",
  src: STICKER_FONT_PATHS.arabic,
});

Font.register({
  family: "StickerDevanagari",
  src: STICKER_FONT_PATHS.devanagari,
});

type StickerSheetDocumentProps = {
  title: string;
  urlBaseLabel: string;
  branding: StickerBrandingConfig;
  qrSizeMm: 25 | 30 | 35;
  items: StickerSheetItem[];
  labelVariant?: "product" | "carton";
  showSerial?: boolean;
  instructionTextEn?: string;
};

function mmToPt(mm: number) {
  return (mm / 25.4) * 72;
}

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 7,
    fontFamily: "StickerSans",
    color: "#0f172a",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 11,
    fontFamily: "StickerSans",
    fontWeight: 700,
  },
  headerMeta: {
    fontSize: 8,
    fontFamily: "StickerSans",
    color: "#475569",
  },
  grid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  label: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 4,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    width: 44,
    height: 14,
    objectFit: "contain",
    marginBottom: 2,
  },
  instruction: {
    fontSize: 6,
    fontFamily: "StickerSans",
    textAlign: "center",
    marginBottom: 2,
  },
  qr: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 3,
  },
  qrWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  qrCenterLogo: {
    position: "absolute",
    objectFit: "contain",
  },
  serial: {
    fontSize: 7,
    fontFamily: "StickerSans",
    fontWeight: 700,
    marginTop: 2,
  },
  domain: {
    fontSize: 6,
    fontFamily: "StickerSans",
    color: "#475569",
    marginTop: 1,
  },
});

export function StickerSheetDocument({
  title,
  urlBaseLabel,
  branding,
  qrSizeMm,
  items,
  showSerial = true,
  instructionTextEn,
}: StickerSheetDocumentProps) {
  const primaryInstruction = instructionTextEn ?? branding.instructionTextEn;

  const qrSizePt = mmToPt(qrSizeMm);
  const qrCenterLogoSizePt = (qrSizePt * branding.qrLogoScalePercent) / 100;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const padding = 18;
  const columns = 5;
  const usableWidth = pageWidth - padding * 2;

  const labelWidth = usableWidth / columns;
  const labelHeight = qrSizePt + 26;
  const rows = Math.max(
    1,
    Math.floor((pageHeight - padding * 2 - 26) / labelHeight),
  );
  const labelsPerPage = columns * rows;

  const pages: StickerSheetItem[][] = [];
  for (let offset = 0; offset < items.length; offset += labelsPerPage) {
    pages.push(items.slice(offset, offset + labelsPerPage));
  }

  return (
    <Document title={title}>
      {pages.map((pageItems, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerMeta}>
              {qrSizeMm}mm • {urlBaseLabel}
            </Text>
          </View>

          <View style={styles.grid}>
            {pageItems.map((item) => (
              <View
                key={item.stickerSerial}
                style={[
                  styles.label,
                  {
                    width: labelWidth,
                    height: labelHeight,
                    borderColor: branding.primaryColor || "#e2e8f0",
                  },
                ]}
              >
                <View>
                  {branding.logoUrl ? (
                    <PdfImage src={branding.logoUrl} style={styles.logo} />
                  ) : null}
                  <Text style={styles.instruction}>{primaryInstruction}</Text>
                </View>

                <View
                  style={[
                    styles.qrWrapper,
                    { width: qrSizePt, height: qrSizePt },
                  ]}
                >
                  <PdfImage
                    src={item.qrDataUrl}
                    style={[styles.qr, { width: qrSizePt, height: qrSizePt }]}
                  />
                  {branding.logoUrl && branding.showLogoInQrCenter ? (
                    <PdfImage
                      src={branding.logoUrl}
                      style={[
                        styles.qrCenterLogo,
                        {
                          width: qrCenterLogoSizePt,
                          height: qrCenterLogoSizePt,
                        },
                      ]}
                    />
                  ) : null}
                </View>

                {showSerial ? (
                  <View>
                    <Text style={styles.serial}>{item.stickerSerial}</Text>
                    <Text style={styles.domain}>{urlBaseLabel}</Text>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.domain}>{urlBaseLabel}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}

export function createStickerSheetPdfDocument(
  props: StickerSheetDocumentProps,
): ReactElement<DocumentProps> {
  return <StickerSheetDocument {...props} />;
}
