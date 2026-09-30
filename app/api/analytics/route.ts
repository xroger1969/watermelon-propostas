import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";

const EVENT_TYPES = new Set([
  "page_view",
  "booking_request",
  "proposal_request",
  "ai_crm_lead",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AnalyticsInput = {
  eventType?: string;
  visitorId?: string;
  sessionId?: string;
  path?: string;
  referrerHost?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  deviceType?: string;
  value?: number | null;
  currency?: string;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const userAgent = request.headers.get("user-agent") || "";

  if (
    /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|headless/i.test(
      userAgent
    )
  ) {
    return NextResponse.json({ ok: true, skipped: "bot" });
  }

  let input: AnalyticsInput;
  try {
    input = (await request.json()) as AnalyticsInput;
  } catch {
    return NextResponse.json({ error: "Invalid analytics request." }, { status: 400 });
  }

  const eventType = clean(input.eventType, 40);
  const visitorId = clean(input.visitorId, 40);
  const sessionId = clean(input.sessionId, 40);

  if (
    !EVENT_TYPES.has(eventType) ||
    !UUID_RE.test(visitorId) ||
    !UUID_RE.test(sessionId)
  ) {
    return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });
  }

  const path = clean(input.path, 500) || "/";
  const countryCode =
    clean(
      request.headers.get("x-vercel-ip-country") ||
        request.headers.get("cf-ipcountry") ||
        "",
      2
    ).toUpperCase() || null;

  const supabase = createClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase.rpc("watermelon_track_analytics_event", {
    p_event_type: eventType,
    p_visitor_id: visitorId,
    p_session_id: sessionId,
    p_path: path.startsWith("/") ? path : "/",
    p_referrer_host: clean(input.referrerHost, 255) || null,
    p_source: clean(input.source, 120) || null,
    p_medium: clean(input.medium, 120) || null,
    p_campaign: clean(input.campaign, 200) || null,
    p_country_code: countryCode,
    p_device_type: clean(input.deviceType, 20) || "unknown",
    p_value:
      typeof input.value === "number" &&
      Number.isFinite(input.value) &&
      input.value >= 0
        ? input.value
        : null,
    p_currency: clean(input.currency, 3).toUpperCase() || "EUR",
  });

  if (error) {
    console.error("Analytics event could not be stored", error);
    return NextResponse.json({ error: "Analytics unavailable." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
