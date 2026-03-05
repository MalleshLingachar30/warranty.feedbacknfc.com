import Link from "next/link";

import type { NfcLanguage } from "@/lib/nfc-i18n";
import { getNfcCopy } from "@/lib/nfc-i18n";

interface NfcLanguageToggleProps {
  currentLanguage: NfcLanguage;
  englishHref: string;
  hindiHref: string;
}

export function NfcLanguageToggle({
  currentLanguage,
  englishHref,
  hindiHref,
}: NfcLanguageToggleProps) {
  const copy = getNfcCopy(currentLanguage);

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-1 py-1 text-xs">
      <span className="px-1 text-slate-500">{copy.languageLabel}</span>
      <Link
        href={englishHref}
        className={`rounded-full px-2 py-1 ${
          currentLanguage === "en"
            ? "bg-blue-600 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {copy.languageEnglish}
      </Link>
      <Link
        href={hindiHref}
        className={`rounded-full px-2 py-1 ${
          currentLanguage === "hi"
            ? "bg-blue-600 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {copy.languageHindi}
      </Link>
    </div>
  );
}
