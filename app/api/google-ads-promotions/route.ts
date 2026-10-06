import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PromotionRow = {
  product_code: string;
  title: string;
  label: string;
  before_price: number;
  now_price: number;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
};

function safeTarget(value: string) {
  const clean = value.replace(/[^a-zA-Z0-9À-ÿ &+\-]/g, " ").replace(/\s+/g, " ").trim();
  return (clean || "Watermelon tours").slice(0, 20);
}

function discountPercent(before: number, now: number) {
  if (!Number.isFinite(before) || !Number.isFinite(now) || before <= 0 || now <= 0 || now >= before) {
    return null;
  }
  return Math.max(1, Math.min(99, Math.round(((before - now) / before) * 100)));
}

export async function GET() {
  const supabase = createClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase
    .from("watermelon_site_promotions")
    .select("product_code,title,label,before_price,now_price,currency,starts_on,ends_on")
    .order("product_code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { promotions: [], error: "Unable to load website promotions." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rows = (data || []) as PromotionRow[];
  const groups = new Map<
    string,
    {
      percentOff: number;
      label: string;
      currency: string;
      startsOn: string | null;
      endsOn: string | null;
      rows: PromotionRow[];
    }
  >();

  for (const row of rows) {
    const percentOff = discountPercent(Number(row.before_price), Number(row.now_price));
    if (!percentOff) continue;

    const key = [
      percentOff,
      row.label || "Website offer",
      row.currency || "EUR",
      row.starts_on || "",
      row.ends_on || "",
    ].join("|");

    const current = groups.get(key);
    if (current) {
      current.rows.push(row);
    } else {
      groups.set(key, {
        percentOff,
        label: row.label || "Website offer",
        currency: row.currency || "EUR",
        startsOn: row.starts_on || null,
        endsOn: row.ends_on || null,
        rows: [row],
      });
    }
  }

  const promotions = Array.from(groups.values()).map((group, index) => ({
    key: "wm-site-" + index + "-" + group.percentOff,
    target:
      group.rows.length > 1
        ? "Watermelon tours"
        : safeTarget(group.rows[0]?.title || "Watermelon tours"),
    percentOff: group.percentOff,
    label: group.label,
    startsOn: group.startsOn,
    endsOn: group.endsOn,
    finalUrl: "https://www.watermelonexperiences.pt/",
    terms:
      "Direct bookings on watermelonexperiences.pt only. Subject to availability.",
    experienceCount: group.rows.length,
    productCodes: group.rows.map((row) => row.product_code),
  }));

  return NextResponse.json(
    {
      source: "watermelon-site-promotions",
      campaignId: "281499272571268",
      generatedAt: new Date().toISOString(),
      promotions,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
