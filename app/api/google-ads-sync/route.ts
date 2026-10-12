import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_BOOKING_URL, SUPABASE_BOOKING_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { validateAdsReport } from "@/lib/google-ads-report";
import { buildGoogleAdsSyncScript } from "@/lib/google-ads-sync-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
const client = (authorization?: string) => createClient(SUPABASE_BOOKING_URL, SUPABASE_BOOKING_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
});

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Sign in to the CRM to configure reports." }, { status: 401, headers });
  }
  try {
    // This existing RPC validates the signed-in user against the private admin list.
    const { error } = await client(authorization).rpc("watermelon_marketing_summary");
    if (error) return NextResponse.json({ error: "CRM administrator access is required." }, { status: 403, headers });
    const token = process.env.GOOGLE_ADS_REPORT_TOKEN || "";
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json({ error: "Automatic report receiver is not configured." }, { status: 503, headers });
    }
    return NextResponse.json({ script: buildGoogleAdsSyncScript(token) }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not load report setup. Please retry." }, { status: 502, headers });
  }
}

export async function POST(request: NextRequest) {
  const expected = process.env.GOOGLE_ADS_REPORT_TOKEN || "";
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    return NextResponse.json({ ok: false, error: "Report receiver is not configured." }, { status: 503, headers });
  }
  if (!/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    return NextResponse.json({ ok: false, error: "Invalid report authorization." }, { status: 401, headers });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "JSON report required." }, { status: 415, headers });
  }
  if (Number(request.headers.get("content-length") || 0) > 100000) {
    return NextResponse.json({ ok: false, error: "Report too large." }, { status: 413, headers });
  }
  let report: unknown;
  try {
    const text = await request.text();
    if (text.length > 100000) return NextResponse.json({ ok: false, error: "Report too large." }, { status: 413, headers });
    report = JSON.parse(text);
    validateAdsReport(report);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid or incomplete Google Ads report." }, { status: 400, headers });
  }
  try {
    const { data, error } = await client().rpc("watermelon_import_google_ads_report", { p_token: expected, p_report: report });
    if (error) return NextResponse.json({ ok: false, error: "Report import rejected. Previous data was preserved." }, { status: 422, headers });
    return NextResponse.json({ ok: true, report: data }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Report storage unavailable. Please retry." }, { status: 502, headers });
  }
}
