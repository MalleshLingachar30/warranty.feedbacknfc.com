import Script from "next/script";

import WarrantyChat from "@/components/WarrantyChat";
import {
  loadLandingPageContent,
  type LandingLanguage,
  type LandingRegion,
} from "@/lib/landing-page";

interface MarketingPageProps {
  searchParams?: Promise<{ lang?: string; region?: string }>;
}

export default async function MarketingPage({
  searchParams,
}: MarketingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const region: LandingRegion =
    resolvedSearchParams?.region === "sa" ? "sa" : "in";
  const lang: LandingLanguage =
    region === "sa" && resolvedSearchParams?.lang === "ar" ? "ar" : "en";
  const pageContent = await loadLandingPageContent(region, lang);

  return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <Script
        src="https://unpkg.com/lucide@latest"
        strategy="afterInteractive"
      />

      <style dangerouslySetInnerHTML={{ __html: pageContent.styleCss }} />

      <div
        lang={pageContent.lang}
        dir={pageContent.dir}
        className={pageContent.bodyClassName}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: pageContent.bodyHtml }}
      />

      {pageContent.scriptJs ? (
        <Script
          id={`landing-script-${pageContent.lang}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: pageContent.scriptJs }}
        />
      ) : null}

      <WarrantyChat />
    </>
  );
}
