import { promises as fs } from "node:fs";
import path from "node:path";

import type { StickerRegionalLanguage } from "@/lib/sticker-config";

const FONT_PUBLIC_DIR = path.join(process.cwd(), "public", "fonts");

export const STICKER_FONT_PATHS = {
  sans: path.join(FONT_PUBLIC_DIR, "NotoSans-Regular.ttf"),
  arabic: path.join(FONT_PUBLIC_DIR, "NotoSansArabic-Regular.ttf"),
  devanagari: path.join(FONT_PUBLIC_DIR, "NotoSansDevanagari-Regular.ttf"),
} as const;

type StickerFontFamily = "StickerSans" | "StickerArabic" | "StickerDevanagari";

type StickerFontData = {
  sansBase64: string;
  arabicBase64: string;
  devanagariBase64: string;
};

let fontDataPromise: Promise<StickerFontData> | null = null;

function encodeFont(buffer: Buffer) {
  return buffer.toString("base64");
}

export async function getStickerFontData(): Promise<StickerFontData> {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([
      fs.readFile(STICKER_FONT_PATHS.sans),
      fs.readFile(STICKER_FONT_PATHS.arabic),
      fs.readFile(STICKER_FONT_PATHS.devanagari),
    ]).then(([sansBuffer, arabicBuffer, devanagariBuffer]) => ({
      sansBase64: encodeFont(sansBuffer),
      arabicBase64: encodeFont(arabicBuffer),
      devanagariBase64: encodeFont(devanagariBuffer),
    }));
  }

  return fontDataPromise;
}

export function getStickerSecondaryFontFamily(
  language: StickerRegionalLanguage,
): StickerFontFamily {
  return language === "ar" ? "StickerArabic" : "StickerDevanagari";
}

export function getStickerSecondaryFontPath(language: StickerRegionalLanguage) {
  return language === "ar"
    ? STICKER_FONT_PATHS.arabic
    : STICKER_FONT_PATHS.devanagari;
}
