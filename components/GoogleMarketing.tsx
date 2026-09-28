"use client";

import Script from "next/script";

const DEFAULT_GOOGLE_ADS_ID = "AW-999129069";

export default function GoogleMarketing() {
  const adsId =
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || DEFAULT_GOOGLE_ADS_ID;
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID?.trim();
  const primaryId = adsId || ga4Id;

  if (!primaryId) return null;

  const configIds = [adsId, ga4Id].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index
  );

  const initScript = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "window.gtag = gtag;",
    "gtag('js', new Date());",
    ...configIds.map((id) => `gtag('config', ${JSON.stringify(id)});`),
  ].join("\n");

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryId)}`}
        strategy="afterInteractive"
      />
      <Script
        id="watermelon-google-marketing"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: initScript }}
      />
    </>
  );
}
