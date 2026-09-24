import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CreateBookingRequestInput } from "@/types/booking";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";

function referenceCode() {
  const date = new Date();
  const stamp = [
    String(date.getUTCFullYear()).slice(-2),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase();
  return `WM-${stamp}-${random}`;
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let input: CreateBookingRequestInput;
  try {
    input = (await request.json()) as CreateBookingRequestInput;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guests = Math.max(1, Math.min(50, Number(input.guests) || 1));
  const unitPrice =
    input.unitPrice === null || input.unitPrice === undefined
      ? null
      : Math.max(0, Number(input.unitPrice) || 0);

  const productCode = clean(input.productCode, 80);
  const experienceTitle = clean(input.experienceTitle, 250);
  const requestedDate = clean(input.requestedDate, 10);
  const customerName = clean(input.customerName, 150);
  const customerPhone = clean(input.customerPhone, 80);

  if (!productCode || !experienceTitle || !requestedDate || !customerName || !customerPhone) {
    return NextResponse.json(
      { error: "Please complete the required booking details." },
      { status: 400 }
    );
  }

  const estimatedTotal = unitPrice === null ? null : Number((unitPrice * guests).toFixed(2));
  const reference = referenceCode();

  const supabase = createClient(SUPABASE_BOOKING_URL, SUPABASE_BOOKING_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("watermelon_booking_requests")
    .insert({
      reference,
      status: "pending",
      payment_status: "not_requested",
      product_code: productCode,
      experience_title: experienceTitle,
      option_code: clean(input.optionCode, 80) || null,
      option_name: clean(input.optionName, 200) || null,
      requested_date: requestedDate,
      preferred_time: clean(input.preferredTime, 80) || null,
      guests,
      unit_price: unitPrice,
      currency: clean(input.currency, 3).toUpperCase() || "EUR",
      estimated_total: estimatedTotal,
      customer_name: customerName,
      customer_email: clean(input.customerEmail, 250) || null,
      customer_phone: customerPhone,
      pickup_location: clean(input.pickupLocation, 500) || null,
      language: clean(input.language, 80) || null,
      customer_notes: clean(input.customerNotes, 2000) || null,
    })
    .select("id, reference")
    .single();

  if (error || !data) {
    console.error("Unable to store booking request", error);
    return NextResponse.json(
      { error: "We could not save your booking request. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: data.id,
    reference: data.reference,
    status: "pending",
  });
}
