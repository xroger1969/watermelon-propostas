import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };
type TailorIdea = { title?: string; concept?: string; reason?: string };
type TailorInput = {
  conversationId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  requestedDate?: string;
  guests?: number;
  notes?: string;
  history?: ChatMessage[];
  ideas?: TailorIdea[];
  consent?: boolean;
};

const limits = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 10 * 60_000;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validDate(date: string) {
  if (!date) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year &&
    actual.getUTCMonth() + 1 === month && actual.getUTCDate() === day;
}

function referenceForConversation(id: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon", year: "2-digit", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date()).filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const stamp = [parts.year, parts.month, parts.day].join("");
  const suffix = createHash("sha256").update(id).digest("hex").slice(0, 8).toUpperCase();
  return "WM-AI-" + stamp + "-" + suffix;
}

function allowed(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") || "anonymous";
  const key = createHash("sha256").update(ip).digest("hex");
  const now = Date.now();
  const previous = limits.get(key);
  if (!previous || previous.until <= now) {
    limits.set(key, { count: 1, until: now + WINDOW_MS });
    return true;
  }
  if (previous.count >= 5) return false;
  previous.count++;
  return true;
}

/**
 * Explicit customer submission. No OpenAI request or live catalogue lookup is
 * required: bespoke enquiries must work even when the AI or Viator is down.
 * This uses the existing CRM RPC; its INSERT trigger starts the owner push flow.
 * Do not claim the push notification was delivered from this endpoint.
 */
export async function POST(request: NextRequest) {
  if (!allowed(request)) {
    return NextResponse.json({ error: "Too many requests. Please try later." }, { status: 429 });
  }

  let input: TailorInput;
  try {
    input = (await request.json()) as TailorInput;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = clean(input.customerName, 150);
  const phone = clean(input.customerPhone, 80);
  const email = clean(input.customerEmail, 250);
  const requestedDate = clean(input.requestedDate, 10);
  const notes = clean(input.notes, 1500);
  const guests = Number(input.guests);
  const conversationId = clean(input.conversationId, 100);
  if (input.consent !== true || !name || (phone.match(/\d/g)?.length || 0) < 7 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      !validDate(requestedDate) || !Number.isInteger(guests) || guests < 1 || guests > 50 ||
      !/^[A-Za-z0-9-]{8,100}$/.test(conversationId)) {
    return NextResponse.json({ error: "Please complete your name, valid phone, number of guests and privacy consent." }, { status: 400 });
  }

  const history = (Array.isArray(input.history) ? input.history : [])
    .filter((entry): entry is ChatMessage =>
      (entry?.role === "user" || entry?.role === "assistant") && typeof entry?.content === "string")
    .slice(-8)
    .map((entry) => (entry.role === "user" ? "Traveller: " : "Watermelon AI: ") + clean(entry.content, 600));
  const ideas = (Array.isArray(input.ideas) ? input.ideas : []).slice(0, 2)
    .map((idea) => ({
      title: clean(idea?.title, 200),
      concept: clean(idea?.concept, 500),
      reason: clean(idea?.reason, 300),
    }))
    .filter((idea) => idea.title || idea.concept);
  if (!notes && !history.length && !ideas.length) {
    return NextResponse.json({ error: "Please describe the experience you want." }, { status: 400 });
  }

  const reference = referenceForConversation(conversationId);
  const subject = ideas[0]?.title || "Personalized itinerary / tailor-made enquiry";
  const brief = [
    "Explicit tailor-made enquiry from the Watermelon iOS app.",
    "For human review: do not assume price, availability or booking confirmation.",
    notes && "Extra requirements: " + notes,
    ...ideas.map((idea) => "Concept: " + idea.title + ". " + idea.concept + " " + idea.reason),
  ].filter(Boolean).join("\n");
  const customerNotes = [brief, "Conversation context:", ...history].join("\n").slice(0, 4000);

  const item = {
    position: 0,
    product_code: null,
    experience_title: subject,
    option_code: null,
    option_name: "Tailor-made concept — subject to Watermelon review",
    requested_date: requestedDate || null,
    preferred_time: "To be agreed",
    date_flexibility: requestedDate ? "Preferred date" : "Flexible / to be agreed",
    guests,
    unit_price: null,
    subtotal: null,
    pricing_mode: "per_person",
    pickup_location: null,
    guide_language: null,
    special_request: brief.slice(0, 2000),
    children_ages: null,
    accessibility: null,
    dietary: null,
    occasion: null,
  };

  try {
    const supabase = createClient(
      SUPABASE_BOOKING_URL,
      SUPABASE_BOOKING_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: requestId, error } = await supabase.rpc(
      "watermelon_create_ai_proposal_request",
      {
        p_reference: reference,
        p_customer_name: name,
        p_customer_email: email,
        p_customer_phone: phone,
        p_customer_notes: customerNotes,
        p_estimated_total: 0,
        p_currency: "EUR",
        p_items: [item],
      }
    );
    if (error || !requestId) {
      console.error("Tailor-made CRM request failed", error);
      return NextResponse.json(
        { error: "We could not register your proposal request. Please try again." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { reference, status: "new" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Tailor-made CRM server error", error);
    return NextResponse.json(
      { error: "We could not register your proposal request. Please try again." },
      { status: 500 }
    );
  }
}
