import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";

type ProposalItemInput = {
  code?: string;
  title?: string;
  optionCode?: string;
  optionName?: string;
  date?: string;
  guests?: number;
  preferredTime?: string;
  dateFlexibility?: string;
  pickupLocation?: string;
  language?: string;
  notes?: string;
  childrenAges?: string;
  accessibility?: string;
  dietary?: string;
  occasion?: string;
  unitPrice?: number | null;
};

type ProposalRequestInput = {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerNotes?: string;
  currency?: string;
  items?: ProposalItemInput[];
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function referenceCode() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const stamp = [parts.year, parts.month, parts.day].join("");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `WM-P-${stamp}-${random}`;
}

export async function POST(request: Request) {
  let input: ProposalRequestInput;

  try {
    input = (await request.json()) as ProposalRequestInput;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const customerName = clean(input.customerName, 150);
  const customerEmail = clean(input.customerEmail, 250);
  const customerPhone = clean(input.customerPhone, 80);
  const customerNotes = clean(input.customerNotes, 4000);
  const currency = clean(input.currency, 3).toUpperCase() || "EUR";
  const rawItems = Array.isArray(input.items) ? input.items.slice(0, 20) : [];

  if (!customerName || !customerPhone || rawItems.length === 0) {
    return NextResponse.json(
      { error: "Please add your name, phone number and at least one experience." },
      { status: 400 }
    );
  }

  const items = rawItems.map((item, index) => {
    const guests = Math.max(1, Math.min(50, Number(item.guests) || 1));
    const unitPrice =
      item.unitPrice === null || item.unitPrice === undefined
        ? null
        : Math.max(0, Number(item.unitPrice) || 0);

    return {
      position: index,
      product_code: clean(item.code, 80) || null,
      experience_title: clean(item.title, 250) || "Experience",
      option_code: clean(item.optionCode, 80) || null,
      option_name: clean(item.optionName, 200) || null,
      requested_date: clean(item.date, 10) || null,
      preferred_time: clean(item.preferredTime, 80) || "Flexible",
      date_flexibility: clean(item.dateFlexibility, 80) || "Exact date",
      guests,
      unit_price: unitPrice,
      subtotal: unitPrice === null ? null : Number((unitPrice * guests).toFixed(2)),
      pickup_location: clean(item.pickupLocation, 500) || null,
      guide_language: clean(item.language, 80) || null,
      special_request: clean(item.notes, 2000) || null,
      children_ages: clean(item.childrenAges, 500) || null,
      accessibility: clean(item.accessibility, 1000) || null,
      dietary: clean(item.dietary, 1000) || null,
      occasion: clean(item.occasion, 500) || null,
    };
  });

  const estimatedTotal = items.reduce(
    (sum, item) => sum + (item.subtotal === null ? 0 : item.subtotal),
    0
  );
  const reference = referenceCode();

  const supabase = createClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.rpc("watermelon_create_proposal_request", {
    p_reference: reference,
    p_customer_name: customerName,
    p_customer_email: customerEmail,
    p_customer_phone: customerPhone,
    p_customer_notes: customerNotes,
    p_estimated_total: Number(estimatedTotal.toFixed(2)),
    p_currency: currency,
    p_items: items,
  });

  if (error || !data) {
    console.error("Unable to store proposal request", error);
    return NextResponse.json(
      { error: "We could not save your proposal request. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    reference,
    status: "new",
  });
}
