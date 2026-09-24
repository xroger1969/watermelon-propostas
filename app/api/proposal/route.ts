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

function client() {
  return createClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = (url.searchParams.get("reference") || "").trim().slice(0, 80);
  const token = (url.searchParams.get("token") || "").trim();

  if (!reference || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid proposal link." }, { status: 400 });
  }

  const supabase = client();
  const { data, error } = await supabase.rpc("watermelon_proposal_page", {
    p_reference: reference,
    p_token: token,
  });

  if (error) {
    console.error("Unable to load proposal", error);
    return NextResponse.json(
      { error: "We could not load this proposal." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "This proposal link is invalid or no longer available." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { proposal: data },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  let input: {
    reference?: string;
    token?: string;
    action?: string;
    message?: string;
  };

  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const reference = (input.reference || "").trim().slice(0, 80);
  const token = (input.token || "").trim();
  const action = (input.action || "").trim();
  const message = (input.message || "").trim().slice(0, 2000);

  if (!reference || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid proposal link." }, { status: 400 });
  }

  if (action !== "accept" && action !== "request_changes") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const supabase = client();
  const { data, error } = await supabase.rpc("watermelon_respond_to_proposal", {
    p_reference: reference,
    p_token: token,
    p_action: action,
    p_message: message || null,
  });

  if (error) {
    console.error("Unable to update proposal response", error);
    return NextResponse.json(
      { error: "We could not record your response. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: data });
}
