"use client";

export type AnalyticsEventType =
  | "page_view"
  | "booking_request"
  | "proposal_request"
  | "ai_crm_lead";

const CONSENT_STORAGE_KEY = "watermelon-consent-v1";
const VISITOR_STORAGE_KEY = "watermelon-analytics-visitor-v1";
const SESSION_STORAGE_KEY = "watermelon-analytics-session-v1";
const ATTRIBUTION_STORAGE_KEY = "watermelon-analytics-attribution-v1";

type Attribution = {
  source: string;
  medium: string;
  campaign: string;
  referrerHost: string;
};

function analyticsConsentGranted() {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { analytics?: boolean };
    return parsed.analytics === true;
  } catch {
    return false;
  }
}

function getOrCreateId(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }

  const next = crypto.randomUUID();
  storage.setItem(key, next);
  return next;
}

function referrerHost() {
  if (!document.referrer) return "";

  try {
    const referrer = new URL(document.referrer);
    if (referrer.hostname === window.location.hostname) return "";
    return referrer.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getAttribution(): Attribution {
  try {
    const saved = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Attribution>;
      if (typeof parsed.source === "string") {
        return {
          source: parsed.source || "direct",
          medium: typeof parsed.medium === "string" ? parsed.medium : "",
          campaign: typeof parsed.campaign === "string" ? parsed.campaign : "",
          referrerHost:
            typeof parsed.referrerHost === "string" ? parsed.referrerHost : "",
        };
      }
    }
  } catch {}

  const params = new URLSearchParams(window.location.search);
  const referrer = referrerHost();
  const utmSource = (params.get("utm_source") || "").slice(0, 120);
  const utmMedium = (params.get("utm_medium") || "").slice(0, 120);
  const campaign = (params.get("utm_campaign") || "").slice(0, 200);

  const attribution: Attribution = {
    source: utmSource || referrer || "direct",
    medium: utmMedium || (utmSource ? "campaign" : referrer ? "referral" : "direct"),
    campaign,
    referrerHost: referrer,
  };

  try {
    window.sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution)
    );
  } catch {}

  return attribution;
}

function deviceType() {
  const ua = navigator.userAgent || "";

  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

export async function trackAnalyticsEvent(
  eventType: AnalyticsEventType,
  value?: number
) {
  if (typeof window === "undefined" || !analyticsConsentGranted()) return false;

  try {
    const visitorId = getOrCreateId(window.localStorage, VISITOR_STORAGE_KEY);
    const sessionId = getOrCreateId(window.sessionStorage, SESSION_STORAGE_KEY);
    const attribution = getAttribution();

    const response = await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventType,
        visitorId,
        sessionId,
        path: window.location.pathname || "/",
        referrerHost: attribution.referrerHost,
        source: attribution.source,
        medium: attribution.medium,
        campaign: attribution.campaign,
        deviceType: deviceType(),
        value:
          typeof value === "number" && Number.isFinite(value) && value >= 0
            ? value
            : null,
        currency: "EUR",
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
