import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

export const alt =
  "Scan the QR code on the product box to activate warranty instantly";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(135deg, #0f172a 0%, #0b3b7a 45%, #06243f 100%)",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "36px 42px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.35), transparent 32%), radial-gradient(circle at 85% 88%, rgba(20, 184, 166, 0.22), transparent 36%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            width: "100%",
            gap: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 56,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                maxWidth: "760px",
              }}
            >
              Scan QR. Activate Warranty in Seconds.
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(16, 185, 129, 0.18)",
                color: "#a7f3d0",
                border: "1px solid rgba(110, 231, 183, 0.6)",
                borderRadius: 999,
                padding: "10px 18px",
                fontSize: 24,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              No Paperwork
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#dbeafe",
              fontWeight: 500,
              maxWidth: "980px",
              lineHeight: 1.3,
            }}
          >
            Customer scans the code on the TV box or product package and
            warranty is activated instantly.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: "20px",
              marginTop: "4px",
            }}
          >
            <FlowCard
              title="1. QR on Box"
              subtitle="At sale or first use"
              accent="#2563eb"
            >
              <QrBadge />
            </FlowCard>

            <FlowArrow />

            <FlowCard
              title="2. Scan on Phone"
              subtitle="One quick scan"
              accent="#0891b2"
            >
              <PhoneFrame />
            </FlowCard>

            <FlowArrow />

            <FlowCard
              title="3. Warranty Active"
              subtitle="Instant confirmation"
              accent="#059669"
            >
              <SuccessBadge />
            </FlowCard>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function FlowCard({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        borderRadius: 22,
        background: "rgba(255, 255, 255, 0.96)",
        color: "#0f172a",
        border: `2px solid ${accent}`,
        boxShadow: "0 12px 40px rgba(2, 6, 23, 0.35)",
        padding: "18px 18px 14px",
        justifyContent: "space-between",
        minHeight: "228px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div style={{ display: "flex", fontSize: 31, fontWeight: 800 }}>
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#334155" }}>
          {subtitle}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "10px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      style={{
        width: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#bfdbfe",
        fontWeight: 800,
        fontSize: 42,
        lineHeight: 1,
      }}
    >
      →
    </div>
  );
}

function QrBadge() {
  return (
    <div
      style={{
        width: 124,
        height: 124,
        borderRadius: 12,
        border: "6px solid #0f172a",
        background: "white",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gridTemplateRows: "repeat(5, 1fr)",
        gap: 5,
        padding: 8,
      }}
    >
      {[1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0,
        1, 1].map((dot, index) => (
        <div
          key={index}
          style={{
            borderRadius: 2,
            background: dot ? "#0f172a" : "#ffffff",
          }}
        />
      ))}
    </div>
  );
}

function PhoneFrame() {
  return (
    <div
      style={{
        width: 96,
        height: 152,
        borderRadius: 16,
        border: "6px solid #0f172a",
        background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 8,
          background:
            "linear-gradient(180deg, rgba(14, 165, 233, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)",
          border: "2px solid rgba(125, 211, 252, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#e0f2fe",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        Scan
      </div>
    </div>
  );
}

function SuccessBadge() {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "2px solid #059669",
        background: "#ecfdf5",
        color: "#065f46",
        padding: "12px 16px",
        fontSize: 26,
        fontWeight: 800,
        textAlign: "center",
        lineHeight: 1.25,
      }}
    >
      Warranty
      <br />
      Activated
    </div>
  );
}
