export type LeadConversionType =
  | "booking_request"
  | "proposal_request"
  | "ai_crm_lead";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function conversionLabel(type: LeadConversionType) {
  if (type === "booking_request") {
    return process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_LABEL?.trim();
  }
  if (type === "proposal_request") {
    return process.env.NEXT_PUBLIC_GOOGLE_ADS_PROPOSAL_LABEL?.trim();
  }
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_AI_LEAD_LABEL?.trim();
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

  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
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
