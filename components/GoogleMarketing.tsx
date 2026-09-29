"use client";

import Script from "next/script";

const CURRENT_GOOGLE_ADS_ID = "AW-18482784763";
const LEGACY_GOOGLE_ADS_ID = "AW-999129069";

function resolveGoogleAdsId() {
  const configured = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (!configured || configured === LEGACY_GOOGLE_ADS_ID) {
    return CURRENT_GOOGLE_ADS_ID;
  }
  return configured;
}

export default function GoogleMarketing() {
  const adsId = resolveGoogleAdsId();
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
