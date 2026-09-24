import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = (url.searchParams.get("reference") || "").trim().slice(0, 80);
  const token = (url.searchParams.get("token") || "").trim();

  if (!reference || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid payment link." }, { status: 400 });
  }

  const supabase = createClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.rpc("watermelon_payment_page", {
    p_reference: reference,
    p_token: token,
  });

  if (error) {
    console.error("Unable to load secure payment page", error);
    return NextResponse.json(
      { error: "We could not load the payment options." },
      { status: 500 }
    );
  }

  const payment = Array.isArray(data) ? data[0] : null;

  if (!payment) {
    return NextResponse.json(
      { error: "This payment link is invalid or no longer available." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { payment },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
