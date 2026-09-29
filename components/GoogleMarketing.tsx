import Script from "next/script";

const CURRENT_GOOGLE_ADS_ID = "AW-18482784763";
const LEGACY_GOOGLE_ADS_ID = "AW-999129069";
const CONSENT_STORAGE_KEY = "watermelon-consent-v1";

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

  const consentBootstrap = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "window.gtag = gtag;",
    "gtag('consent', 'default', {",
    "  ad_storage: 'denied',",
    "  analytics_storage: 'denied',",
    "  ad_user_data: 'denied',",
    "  ad_personalization: 'denied',",
    "  wait_for_update: 500",
    "});",
    "try {",
    `  var savedConsent = localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)});`,
    "  if (savedConsent) {",
    "    var choice = JSON.parse(savedConsent);",
    "    gtag('consent', 'update', {",
    "      ad_storage: choice.advertising === true ? 'granted' : 'denied',",
    "      ad_user_data: choice.advertising === true ? 'granted' : 'denied',",
    "      ad_personalization: choice.advertising === true ? 'granted' : 'denied',",
    "      analytics_storage: choice.analytics === true ? 'granted' : 'denied'",
    "    });",
    "  }",
    "} catch (error) {}",
  ].join("\n");

  const configScript = [
    "gtag('js', new Date());",
    ...configIds.map((id) => `gtag('config', ${JSON.stringify(id)});`),
  ].join("\n");

  return (
    <>
      <Script
        id="watermelon-google-consent-default"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: consentBootstrap }}
      />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryId)}`}
        strategy="afterInteractive"
      />
      <Script
        id="watermelon-google-marketing-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: configScript }}
      />
    </>
  );
}
