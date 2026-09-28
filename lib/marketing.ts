export type LeadConversionType =
  | "booking_request"
  | "proposal_request"
  | "ai_crm_lead";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const DEFAULT_GOOGLE_ADS_ID = "AW-999129069";

const DEFAULT_CONVERSION_LABELS: Record<LeadConversionType, string> = {
  booking_request: "Bbb-CClLmMnNoOpPqQ",
  proposal_request: "3TiGCMuhkokdEO3_tdwD",
  ai_crm_lead: "nD0tCPmwjYkdEO3_tdwD",
};

function conversionLabel(type: LeadConversionType) {
  if (type === "booking_request") {
    return (
      process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_LABEL?.trim() ||
      DEFAULT_CONVERSION_LABELS.booking_request
    );
  }
  if (type === "proposal_request") {
    return (
      process.env.NEXT_PUBLIC_GOOGLE_ADS_PROPOSAL_LABEL?.trim() ||
      DEFAULT_CONVERSION_LABELS.proposal_request
    );
  }
  return (
    process.env.NEXT_PUBLIC_GOOGLE_ADS_AI_LEAD_LABEL?.trim() ||
    DEFAULT_CONVERSION_LABELS.ai_crm_lead
  );
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

  const adsId =
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || DEFAULT_GOOGLE_ADS_ID;
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
