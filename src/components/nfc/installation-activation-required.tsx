import type { ReactNode } from "react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { NfcLanguage } from "@/lib/nfc-i18n";

type InstallationActivationRequiredProps = {
  language: NfcLanguage;
  languageToggle?: ReactNode;
  productName: string;
  manufacturerName: string;
  serialNumber: string;
};

export function InstallationActivationRequired({
  language,
  languageToggle,
  productName,
  manufacturerName,
  serialNumber,
}: InstallationActivationRequiredProps) {
  const title =
    language === "hi" ? "इंस्टॉलेशन आवश्यक है" : "Installation Required";
  const description =
    language === "hi"
      ? "यह उत्पाद इंस्टॉलेशन-ड्रिवन मॉडल है। वारंटी सक्रिय करने के लिए अधिकृत तकनीशियन द्वारा इंस्टॉलेशन रिपोर्ट जमा करना अनिवार्य है।"
      : "This product uses an installation-driven model. Warranty activation requires an authorized technician to submit the installation report.";
  const footer =
    language === "hi"
      ? "स्वयं सक्रियण उपलब्ध नहीं है। कृपया डीलर/सेवा टीम से इंस्टॉलेशन पूरा करवाएं।"
      : "Self-activation is blocked for this model. Please contact your dealer or service team to complete installation.";

  return (
    <NfcPublicShell
      title={title}
      description={description}
      footer={footer}
      subtitle={language === "hi" ? "वारंटी स्मार्ट स्टिकर" : "Warranty Smart Sticker"}
      headerActions={languageToggle}
    >
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          {language === "hi" ? "उत्पाद" : "Product"}:{" "}
          <span className="font-semibold">{productName}</span>
        </p>
        <p>
          {language === "hi" ? "निर्माता" : "Manufacturer"}:{" "}
          <span className="font-semibold">{manufacturerName}</span>
        </p>
        <p>
          {language === "hi" ? "सीरियल नंबर" : "Serial Number"}:{" "}
          <span className="font-semibold">{serialNumber}</span>
        </p>
      </div>
    </NfcPublicShell>
  );
}
