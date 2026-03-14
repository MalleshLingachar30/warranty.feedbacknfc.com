import { LANDING_PAGE_HTML } from "@/lib/generated/landing-page-content";

export type LandingRegion = "in" | "sa";
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
    .replace(/href="sa-en\.html"/g, 'href="/?region=sa"')
    .replace(/href='sa-en\.html'/g, "href='/?region=sa'")
    .replace(/href="ar\.html"/g, 'href="/?region=sa&lang=ar"')
    .replace(/href='ar\.html'/g, "href='/?region=sa&lang=ar'")
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href='index\.html'/g, "href='/'");
}

export function loadLandingPageContent(
  region: LandingRegion,
  lang: LandingLanguage,
): LandingPageContent {
  const normalizedRegion = region === "sa" ? "sa" : "in";
  const normalizedLanguage =
    normalizedRegion === "sa" && lang === "ar" ? "ar" : "en";
  const raw =
    normalizedRegion === "sa"
      ? LANDING_PAGE_HTML.sa[normalizedLanguage]
      : LANDING_PAGE_HTML.in.en;

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
    lang: htmlLang === "ar" && normalizedRegion === "sa" ? "ar" : "en",
    dir: htmlDir === "rtl" ? "rtl" : "ltr",
    bodyClassName,
    styleCss,
    bodyHtml: normalizeLinks(bodyWithoutScript),
    scriptJs,
  };
}
