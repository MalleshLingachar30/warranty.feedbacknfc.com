import { LANDING_PAGE_HTML } from "@/lib/generated/landing-page-content";

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

export function loadLandingPageContent(lang: LandingLanguage): LandingPageContent {
  const raw = LANDING_PAGE_HTML[lang];

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
