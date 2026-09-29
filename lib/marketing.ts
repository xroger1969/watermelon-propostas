export type LeadConversionType =
  | "booking_request"
  | "proposal_request"
  | "ai_crm_lead";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const CURRENT_GOOGLE_ADS_ID = "AW-18482784763";
const LEGACY_GOOGLE_ADS_ID = "AW-999129069";

const LEGACY_CONVERSION_LABELS = new Set([
  "Bbb-CClLmMnNoOpPqQ",
  "3TiGCMuhkokdEO3_tdwD",
  "nD0tCPmwjYkdEO3_tdwD",
]);

function googleAdsId() {
  const configured = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (!configured || configured === LEGACY_GOOGLE_ADS_ID) {
    return CURRENT_GOOGLE_ADS_ID;
  }
  return configured;
}

function conversionLabel(type: LeadConversionType) {
  let label: string | undefined;

  if (type === "booking_request") {
    label = process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_LABEL?.trim();
  } else if (type === "proposal_request") {
    label = process.env.NEXT_PUBLIC_GOOGLE_ADS_PROPOSAL_LABEL?.trim();
  } else {
    label = process.env.NEXT_PUBLIC_GOOGLE_ADS_AI_LEAD_LABEL?.trim();
  }

  if (!label || LEGACY_CONVERSION_LABELS.has(label)) return "";
  return label;
}

export async function trackLeadConversion(
  type: LeadConversionType,
  value?: number
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  const safeValue = Number.isFinite(value) && (value || 0) > 0 ? Number(value) : 0;

  window.gtag("event", "generate_lead", {
    lead_type: type,
    value: safeValue,
    currency: "EUR",
  });

  const adsId = googleAdsId();
  const label = conversionLabel(type);

  if (!adsId || !label) return;

  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    window.gtag?.("event", "conversion", {
      send_to: `${adsId}/${label}`,
      value: safeValue,
      currency: "EUR",
      event_callback: finish,
      event_timeout: 900,
    });

    window.setTimeout(finish, 1000);
  });
}
