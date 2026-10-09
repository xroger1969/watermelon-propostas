/**
 * Attribution classification only. Do not persist this result before analytics consent.
 * Raw Google click IDs are intentionally never stored in our analytics database.
 */
export type Attribution = {
  source: string;
  medium: string;
  campaign: string;
  referrerHost: string;
};

type AttributionInput = {
  search: string;
  referrerHost: string;
  previous?: Attribution | null;
};

function normalizedSource(value: string) {
  const source = value.trim().toLowerCase().slice(0, 120);
  return ["googleads", "google_ads", "google-adwords", "adwords"].includes(source)
    ? "google"
    : source;
}

function normalizedMedium(value: string, source: string) {
  const medium = value.trim().toLowerCase().slice(0, 120);
  if (source === "google" && ["ppc", "paidsearch", "paid_search", "paid-search"].includes(medium)) {
    return "cpc";
  }
  return medium;
}

export function classifyAttribution(input: AttributionInput): Attribution {
  const params = new URLSearchParams(input.search);
  const host = input.referrerHost.trim().toLowerCase().slice(0, 255);
  const previous = input.previous;
  const source = normalizedSource(params.get("utm_source") || "");
  const medium = params.get("utm_medium") || "";
  const campaign = (params.get("utm_campaign") || "").trim().slice(0, 200);
  const paidGoogleClick = ["gclid", "gbraid", "wbraid"].some(
    (key) => Boolean(params.get(key)?.trim())
  );
  // These domains are known Google Ads redirectors, not ordinary Google Search.
  const googleAdReferrer = host === "googleads.g.doubleclick.net" ||
    host === "www.googleadservices.com" ||
    host === "googleadservices.com";

  if (paidGoogleClick || (googleAdReferrer && !source && !medium)) {
    return {
      source: "google",
      medium: "cpc",
      campaign: campaign || (previous?.source === "google" && previous.medium === "cpc"
        ? previous.campaign : ""),
      referrerHost: host || previous?.referrerHost || "",
    };
  }

  if (source || medium || campaign) {
    const effectiveSource = source || (host || "unknown");
    return {
      source: effectiveSource,
      medium: normalizedMedium(medium, effectiveSource) ||
        (effectiveSource === "google" && campaign ? "cpc" : "campaign"),
      campaign,
      referrerHost: host || previous?.referrerHost || "",
    };
  }

  if (previous) return previous;
  return {
    source: host || "direct",
    medium: host ? "referral" : "direct",
    campaign: "",
    referrerHost: host,
  };
}
