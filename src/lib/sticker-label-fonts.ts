import path from "node:path";

const FONT_PUBLIC_DIR = path.join(process.cwd(), "public", "fonts");

export const STICKER_FONT_PATHS = {
  sans: path.join(FONT_PUBLIC_DIR, "NotoSans-Regular.ttf"),
  arabic: path.join(FONT_PUBLIC_DIR, "NotoSansArabic-Regular.ttf"),
  devanagari: path.join(FONT_PUBLIC_DIR, "NotoSansDevanagari-Regular.ttf"),
} as const;
