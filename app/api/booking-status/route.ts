import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_BOOKING_PUBLISHABLE_KEY, SUPABASE_BOOKING_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

// The token is sent in a header, not in a URL, analytics event or log.
export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get("reference") || "";
  const match = /^Bearer ([a-f0-9-]+)$/i.exec(request.headers.get("authorization") || "");
  const token = match?.[1] || "";
  if (!/^[A-Za-z0-9-]{1,80}$/.test(reference) || !UUID.test(token)) {
    return NextResponse.json({ error: "Invalid booking access." }, { status: 400, headers });
  }
  const db = createClient(SUPABASE_BOOKING_URL, SUPABASE_BOOKING_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("watermelon_customer_booking_status", {
    p_reference: reference, p_access_token: token,
  });
  if (error) return NextResponse.json({ error: "Unable to update the booking. Please try again." }, { status: 503, headers });
  if (!data) return NextResponse.json({ error: "Booking unavailable. Please contact Watermelon." }, { status: 404, headers });
  return NextResponse.json({ booking: data }, { headers });
}
