import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabase
    .from("watermelon_site_promotions")
    .select(
      "product_code,title,label,before_price,now_price,currency,starts_on,ends_on"
    )
    .order("product_code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { promotions: [], error: "Unable to load website promotions." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { promotions: data || [] },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
