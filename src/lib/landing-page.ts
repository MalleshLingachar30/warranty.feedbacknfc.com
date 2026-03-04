import { readFile } from "node:fs/promises";
import path from "node:path";

export type LandingLanguage = "en" | "ar";

export interface LandingPageContent {
  lang: LandingLanguage;
  dir: "ltr" | "rtl";
  bodyClassName: string;
  styleCss: string;
  bodyHtml: string;
  scriptJs: string;
}

function extractMatch(source: string, regex: RegExp, fallback = ""): string {
  const match = source.match(regex);
  return match?.[1]?.trim() ?? fallback;
}

function normalizeLinks(bodyHtml: string): string {
  return bodyHtml
    .replace(/href="ar\.html"/g, 'href="/?lang=ar"')
    .replace(/href='ar\.html'/g, "href='/?lang=ar'")
    .replace(/href="index\.html"/g, 'href="/?lang=en"')
    .replace(/href='index\.html'/g, "href='/?lang=en'");
}

export async function loadLandingPageContent(
  lang: LandingLanguage,
): Promise<LandingPageContent> {
  const fileName = lang === "ar" ? "ar.html" : "index.html";
  const raw = await readFile(path.join(process.cwd(), fileName), "utf8");

  const htmlLang = extractMatch(raw, /<html[^>]*\slang="([^"]+)"[^>]*>/i, lang);
  const htmlDir = extractMatch(
    raw,
    /<html[^>]*\sdir="([^"]+)"[^>]*>/i,
    lang === "ar" ? "rtl" : "ltr",
  );
  const bodyClassName = extractMatch(
    raw,
    /<body[^>]*class="([^"]*)"[^>]*>/i,
    "bg-gray-50",
  );

  const styleCss = extractMatch(raw, /<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyInner = extractMatch(raw, /<body[^>]*>([\s\S]*?)<\/body>/i);
  const scriptJs = extractMatch(
    bodyInner,
    /<script[^>]*>([\s\S]*?)<\/script>\s*$/i,
  );
  const bodyWithoutScript = bodyInner.replace(
    /<script[^>]*>[\s\S]*?<\/script>\s*$/i,
    "",
  );

  return {
    lang: htmlLang === "ar" ? "ar" : "en",
    dir: htmlDir === "rtl" ? "rtl" : "ltr",
    bodyClassName,
    styleCss,
    bodyHtml: normalizeLinks(bodyWithoutScript),
    scriptJs,
  };
}
