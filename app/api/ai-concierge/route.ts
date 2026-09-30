import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { experiences } from "@/data/products";
import { viatorListings } from "@/data/viator";
import {
  getLiveViatorCatalog,
  getLiveViatorPrices,
  type LiveViatorCatalogProduct,
} from "@/lib/viator-live";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIRecommendation = {
  code: string;
  reason: string;
};

type TailorMadeIdea = {
  title: string;
  concept: string;
  reason: string;
  status: "tailor_made_concept";
};

type AIQuoteRequest = {
  requested: boolean;
  ready_to_create: boolean;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  requested_date: string;
  guests: number;
  selected_codes: string[];
  tailor_made_titles: string[];
  notes: string;
  success_message: string;
};

type AIPlan = {
  reply: string;
  question: string;
  intent_summary: string;
  recommendations: AIRecommendation[];
  tailor_made_ideas: TailorMadeIdea[];
  quote_request: AIQuoteRequest;
};

type CatalogueItem = {
  code: string;
  title: string;
  description: string;
  category: string;
  location: string;
  duration: string;
  image: string;
  url: string;
  optionCode: string;
  optionName: string;
  priceFrom: number | null;
  currency: string;
};

const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  const userAgent = request.headers.get("user-agent") || "";
  return createHash("sha256").update(ip + "|" + userAgent).digest("hex");
}

function withinRateLimit(key: string) {
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;

  current.count += 1;
  requestWindows.set(key, current);
  return true;
}

function staticCatalogue(): CatalogueItem[] {
  return experiences.flatMap((experience) => {
    const listing = viatorListings[experience.code];
    if (!listing) return [];

    const option = experience.options[0];

    return [
      {
        code: experience.code,
        title: listing.title || experience.title,
        description: experience.description,
        category: experience.category,
        location: experience.location,
        duration: listing.duration,
        image: listing.image,
        url: listing.url,
        optionCode: option?.optionCode || "DEFAULT",
        optionName: option?.optionName || "Standard option",
        priceFrom: listing.price,
        currency: listing.currency,
      },
    ];
  });
}

function liveToCatalogue(products: LiveViatorCatalogProduct[]): CatalogueItem[] {
  return products.map((product) => {
    const fallback = viatorListings[product.code];
    const option = product.options[0];

    return {
      code: product.code,
      title: product.title,
      description: product.description,
      category: product.category,
      location: product.location,
      duration: product.duration,
      image: product.image || fallback?.image || "/logo-full.jpg",
      url: product.url || fallback?.url || "#",
      optionCode: option?.optionCode || "DEFAULT",
      optionName: option?.optionName || "Standard option",
      priceFrom: fallback?.price ?? null,
      currency: fallback?.currency || "EUR",
    };
  });
}

async function loadCatalogue() {
  // CLOSED-WORLD AVAILABILITY RULE:
  // The AI concierge may recommend only products confirmed by the live Viator
  // catalogue. If live catalogue verification fails, the concierge fails closed
  // instead of falling back to older local product data.
  const live = await getLiveViatorCatalog();
  if (!live.length) {
    throw new Error("No active Watermelon experiences were confirmed by the live catalogue");
  }
  return liveToCatalogue(live);
}

function compactCatalogue(items: CatalogueItem[]) {
  return items.map((item) => ({
    code: item.code,
    title: item.title,
    category: item.category,
    location: item.location,
    duration: item.duration,
    priceFrom: item.priceFrom,
    currency: item.currency,
    description: item.description.slice(0, 360),
  }));
}


function aiReferenceCode(conversationId: string) {
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
  const seed = conversationId || randomUUID();
  const suffix = createHash("sha256").update(seed).digest("hex").slice(0, 8).toUpperCase();
  return `WM-AI-${stamp}-${suffix}`;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function outputText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("")
    .trim();
}

const DEVELOPER_INSTRUCTIONS = `You are Watermelon AI Concierge, the travel-planning assistant on the official Watermelon Experiences website in Portugal.

You operate with TWO STRICTLY SEPARATED COMMERCIAL MODES.

MODE 1 — AVAILABLE WATERMELON EXPERIENCES
The supplied WATERMELON CATALOGUE is the complete universe of experiences that you may describe as currently available, recommend as an existing product, price-check, or place into a proposal.
- Recommend ONLY product codes that exist in the supplied WATERMELON CATALOGUE.
- Never describe anything outside that catalogue as currently available from Watermelon.
- Never invent availability, exact prices, inclusions, pickup, accessibility, child suitability, opening hours or booking confirmation.
- Do not infer inclusions from category or location. For example, do not infer a tasting from a winery visit, lunch from a food category, transfer from a tour, or a beach stop from a coastal location unless the supplied product data explicitly says so.
- Explain why a catalogue product fits using only the traveller's stated preferences and facts supplied for that product.
- If there is no good catalogue match, return zero catalogue recommendations rather than forcing a weak match.

MODE 2 — TAILOR-MADE CONCEPTS
You MAY creatively suggest a new bespoke program that Watermelon could potentially design for the traveller, even when that program is not currently in the catalogue, but only under these rules:
- Every such suggestion MUST be returned in tailor_made_ideas and clearly treated as a concept that DOES NOT currently exist as an available product.
- Never put a tailor-made concept inside recommendations.
- Never say or imply that Watermelon already offers, has available, can definitely arrange, has confirmed suppliers for, or has priced the tailor-made concept.
- Never invent a price, availability, supplier, booking status, opening hour, ticket, transfer, meal, guide language or inclusion for a tailor-made concept.
- Keep tailor-made concepts at itinerary/concept level: what the day or experience could combine, the style, pace, theme and why it suits the traveller.
- Specific third-party businesses, hotels, restaurants or suppliers must not be named in a tailor-made concept unless they already appear explicitly in the supplied catalogue.
- A tailor-made concept must always be described as "subject to Watermelon review, feasibility, availability and quotation".
- Use tailor-made ideas when the traveller asks for something not currently available, explicitly asks for something bespoke, or when a genuinely useful bespoke combination would materially improve the trip.
- Return at most 2 tailor-made concepts. Do not generate them merely to fill space.

QUOTE / CRM HANDOFF
- A quote request is a REAL commercial action, not conversational role-play.
- When the traveller explicitly asks for a quote, proposal, price request, or asks you to send/forward the request to Watermelon, set quote_request.requested=true.
- NEVER say that a request was sent, forwarded, created, registered, received by the team, or saved in the CRM inside "reply". You do not have authority to claim that. The backend will create the CRM request after your response is parsed and will only then show the success message.
- Before quote_request.ready_to_create=true, collect these minimum details from the conversation: customer name, phone/WhatsApp number, preferred date in YYYY-MM-DD, number of guests, and at least one clearly selected current catalogue experience or tailor-made concept.
- Email is optional.
- If any minimum detail is missing, set ready_to_create=false and ask ONE concise question for the missing detail(s). You may ask for name and phone together.
- If all minimum details are present and the traveller has explicitly asked for a quote, set ready_to_create=true.
- quote_request.notes is the internal commercial brief for Watermelon. Keep it concise (maximum 2 short sentences) and include only useful proposal details such as group composition, child ages, preferences or constraints. Do not repeat the conversation transcript.
- selected_codes must contain only current WATERMELON CATALOGUE codes that the traveller wants quoted.
- tailor_made_titles must contain only tailor-made concepts from this conversation that the traveller wants reviewed.
- If a relative or natural-language date is unambiguous from the conversation, normalize it to YYYY-MM-DD. Otherwise leave requested_date empty and ask for clarification.
- success_message must be written in the traveller's language, must include the literal placeholder {reference}, and may only say that the request was successfully created/received after the backend has actually saved it. Example meaning: "Your request has been received by Watermelon. Reference: {reference}."
- If an EXISTING CRM REFERENCE is supplied in context, never create another request. Treat the quote as already submitted and refer to that reference if useful.

GENERAL RULES
- Never mention competitors.
- Reply in the same language as the traveller.
- Be concise, warm, premium and practical.
- If the traveller is vague, ask ONE high-value follow-up question.
- If the traveller is specific, answer directly and only ask a question if it materially improves the match.
- Recommend 0 to 4 available experiences and 0 to 2 tailor-made concepts.
- Do not claim that a reservation has been made. Watermelon reviews and confirms everything before booking.
- Keep reply under about 130 words. Keep the follow-up question short.
`

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    question: { type: "string" },
    intent_summary: { type: "string" },
    recommendations: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          reason: { type: "string" },
        },
        required: ["code", "reason"],
      },
    },
    tailor_made_ideas: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          concept: { type: "string" },
          reason: { type: "string" },
          status: { type: "string", enum: ["tailor_made_concept"] },
        },
        required: ["title", "concept", "reason", "status"],
      },
    },
    quote_request: {
      type: "object",
      additionalProperties: false,
      properties: {
        requested: { type: "boolean" },
        ready_to_create: { type: "boolean" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        customer_email: { type: "string" },
        requested_date: { type: "string" },
        guests: { type: "integer", minimum: 0, maximum: 50 },
        selected_codes: {
          type: "array",
          maxItems: 4,
          items: { type: "string" },
        },
        tailor_made_titles: {
          type: "array",
          maxItems: 2,
          items: { type: "string" },
        },
        notes: { type: "string" },
        success_message: { type: "string" },
      },
      required: [
        "requested",
        "ready_to_create",
        "customer_name",
        "customer_phone",
        "customer_email",
        "requested_date",
        "guests",
        "selected_codes",
        "tailor_made_titles",
        "notes",
        "success_message"
      ],
    },
  },
  required: [
    "reply",
    "question",
    "intent_summary",
    "recommendations",
    "tailor_made_ideas",
    "quote_request"
  ],
} as const;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "AI concierge is not configured yet.",
        code: "OPENAI_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const key = clientKey(request);
  if (!withinRateLimit(key)) {
    return NextResponse.json(
      {
        error: "Too many requests. Please try again in a few minutes.",
        code: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      message?: string;
      history?: HistoryMessage[];
      conversationId?: string;
      crmReference?: string;
      currentRecommendations?: Array<{
        code?: string;
        title?: string;
        reason?: string;
      }>;
      currentTailorMadeIdeas?: Array<{
        title?: string;
        concept?: string;
        reason?: string;
      }>;
    };

    const message = (body.message || "").trim().slice(0, 1200);
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (item): item is HistoryMessage =>
              (item?.role === "user" || item?.role === "assistant") &&
              typeof item?.content === "string"
          )
          .slice(-8)
          .map((item) => ({ ...item, content: item.content.slice(0, 1200) }))
      : [];

    if (!message) {
      return NextResponse.json({ error: "Please write a message." }, { status: 400 });
    }

    const catalogue = await loadCatalogue();

    if (!catalogue.length) {
      return NextResponse.json(
        { error: "The Watermelon catalogue is temporarily unavailable." },
        { status: 503 }
      );
    }

    const currentRecommendations = Array.isArray(body.currentRecommendations)
      ? body.currentRecommendations.slice(0, 4).map((item) => ({
          code: cleanText(item?.code, 80),
          title: cleanText(item?.title, 250),
          reason: cleanText(item?.reason, 800),
        }))
      : [];
    const currentTailorMadeIdeas = Array.isArray(body.currentTailorMadeIdeas)
      ? body.currentTailorMadeIdeas.slice(0, 2).map((item) => ({
          title: cleanText(item?.title, 250),
          concept: cleanText(item?.concept, 1500),
          reason: cleanText(item?.reason, 800),
        }))
      : [];
    const existingCRMReference = cleanText(body.crmReference, 80);
    const conversationId = cleanText(body.conversationId, 120);

    const catalogueContext =
      "WATERMELON CATALOGUE (current products only):\n" +
      JSON.stringify(compactCatalogue(catalogue)) +
      "\n\nCURRENT SHORTLIST DISPLAYED TO THE TRAVELLER (for conversational reference only; validate codes against the live catalogue):\n" +
      JSON.stringify(currentRecommendations) +
      "\n\nCURRENT TAILOR-MADE CONCEPTS DISPLAYED TO THE TRAVELLER:\n" +
      JSON.stringify(currentTailorMadeIdeas) +
      "\n\nEXISTING CRM REFERENCE: " +
      (existingCRMReference || "none");

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CONCIERGE_MODEL || "gpt-5.6-terra",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 1000,
        prompt_cache_key: "watermelon-ai-concierge-v1",
        safety_identifier: key.slice(0, 64),
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "watermelon_travel_plan",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        input: [
          {
            role: "developer",
            content: DEVELOPER_INSTRUCTIONS + "\n\n" + catalogueContext,
          },
          ...history,
          { role: "user", content: message },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    if (!openAIResponse.ok) {
      const detail = await openAIResponse.text();
      console.error("Watermelon AI OpenAI error", openAIResponse.status, detail.slice(0, 1200));
      return NextResponse.json(
        { error: "The AI concierge is temporarily unavailable." },
        { status: 502 }
      );
    }

    const raw = await openAIResponse.json();
    const text = outputText(raw);

    if (!text) {
      return NextResponse.json(
        { error: "The AI concierge returned an empty response." },
        { status: 502 }
      );
    }

    const plan = JSON.parse(text) as AIPlan;
    const catalogueByCode = new Map(catalogue.map((item) => [item.code, item]));
    const validRecommendations = (plan.recommendations || [])
      .filter((item) => catalogueByCode.has(item.code))
      .slice(0, 4);

    const livePrices = new Map<string, { price: number; currency: string }>();
    if (validRecommendations.length) {
      try {
        const prices = await getLiveViatorPrices(validRecommendations.map((item) => item.code));
        prices.forEach((price) =>
          livePrices.set(price.code, { price: price.price, currency: price.currency })
        );
      } catch {
        // Static guide prices remain available where known.
      }
    }

    const recommendations = validRecommendations.map((recommendation) => {
      const product = catalogueByCode.get(recommendation.code)!;
      const live = livePrices.get(product.code);

      return {
        code: product.code,
        title: product.title,
        reason: recommendation.reason,
        category: product.category,
        location: product.location,
        duration: product.duration,
        image: product.image,
        url: product.url,
        optionCode: product.optionCode,
        optionName: product.optionName,
        price: live?.price ?? product.priceFrom,
        currency: live?.currency ?? product.currency,
        livePrice: Boolean(live),
      };
    });

    const quote = plan.quote_request;
    let crmReference = existingCRMReference;
    let crmCreated = false;
    let finalReply = plan.reply || "";

    if (
      quote?.requested &&
      quote.ready_to_create &&
      !crmReference &&
      cleanText(quote.customer_name, 150) &&
      cleanText(quote.customer_phone, 80) &&
      validDate(cleanText(quote.requested_date, 10)) &&
      Number(quote.guests) >= 1
    ) {
      const selectedCodes = (quote.selected_codes || [])
        .map((code) => cleanText(code, 80))
        .filter((code) => catalogueByCode.has(code))
        .slice(0, 4);

      const currentReasonByCode = new Map(
        currentRecommendations
          .filter((item) => item.code)
          .map((item) => [item.code, item.reason])
      );
      const planReasonByCode = new Map(
        (plan.recommendations || []).map((item) => [item.code, item.reason])
      );

      const availableItems = selectedCodes.map((code, index) => {
        const product = catalogueByCode.get(code)!;
        const live = livePrices.get(code);
        const price = live?.price ?? product.priceFrom;
        const reason =
          planReasonByCode.get(code) ||
          currentReasonByCode.get(code) ||
          "Selected during the AI Concierge conversation.";

        return {
          position: index,
          product_code: product.code,
          experience_title: product.title,
          option_code: product.optionCode || null,
          option_name: product.optionName || null,
          requested_date: cleanText(quote.requested_date, 10),
          preferred_time: "Flexible",
          date_flexibility: "Exact date",
          guests: Math.max(1, Math.min(50, Number(quote.guests) || 1)),
          unit_price: price,
          subtotal:
            price === null
              ? null
              : Number(
                  (
                    price * Math.max(1, Math.min(50, Number(quote.guests) || 1))
                  ).toFixed(2)
                ),
          pickup_location: null,
          guide_language: null,
          special_request: cleanText("AI Concierge: " + reason, 2000),
          children_ages: null,
          accessibility: null,
          dietary: null,
          occasion: null,
        };
      });

      const tailorPool = [
        ...(plan.tailor_made_ideas || []),
        ...currentTailorMadeIdeas.map((item) => ({
          title: item.title,
          concept: item.concept,
          reason: item.reason,
          status: "tailor_made_concept" as const,
        })),
      ];

      const wantedTailorTitles = new Set(
        (quote.tailor_made_titles || [])
          .map((title) => cleanText(title, 250).toLowerCase())
          .filter(Boolean)
      );
      const seenTailorTitles = new Set<string>();
      const tailorItems = tailorPool
        .filter((idea) => {
          const key = cleanText(idea.title, 250).toLowerCase();
          if (!key || !wantedTailorTitles.has(key) || seenTailorTitles.has(key)) return false;
          seenTailorTitles.add(key);
          return true;
        })
        .slice(0, 2)
        .map((idea, index) => ({
          position: availableItems.length + index,
          product_code: null,
          experience_title: cleanText(idea.title, 250) || "Tailor-made concept",
          option_code: null,
          option_name: "Tailor-made concept — subject to review",
          requested_date: cleanText(quote.requested_date, 10),
          preferred_time: "Flexible",
          date_flexibility: "Exact date",
          guests: Math.max(1, Math.min(50, Number(quote.guests) || 1)),
          unit_price: null,
          subtotal: null,
          pickup_location: null,
          guide_language: null,
          special_request: cleanText(
            "AI tailor-made concept: " +
              cleanText(idea.concept, 1300) +
              " Why it fits: " +
              cleanText(idea.reason, 600) +
              " Subject to Watermelon review, feasibility, availability and quotation.",
            2000
          ),
          children_ages: null,
          accessibility: null,
          dietary: null,
          occasion: null,
        }));

      const crmItems = [...availableItems, ...tailorItems];

      if (crmItems.length > 0) {
        crmReference = aiReferenceCode(conversationId);
        const estimatedTotal = crmItems.reduce(
          (sum, item) => sum + (item.subtotal === null ? 0 : Number(item.subtotal)),
          0
        );
        const transcript = [...history, { role: "user" as const, content: message }]
          .slice(-8)
          .map((item) => (item.role === "user" ? "Customer: " : "AI: ") + item.content)
          .join("\n");
        const customerNotes = cleanText(
          [
            "AI Concierge automatic CRM handoff.",
            "Intent: " + cleanText(plan.intent_summary, 700),
            quote.notes ? "Quote notes: " + cleanText(quote.notes, 700) : "",
            "Conversation context:",
            transcript,
          ]
            .filter(Boolean)
            .join("\n"),
          4000
        );

        const supabase = createClient(
          SUPABASE_BOOKING_URL,
          SUPABASE_BOOKING_PUBLISHABLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );
        const { data: requestId, error: crmError } = await supabase.rpc(
          "watermelon_create_ai_proposal_request",
          {
            p_reference: crmReference,
            p_customer_name: cleanText(quote.customer_name, 150),
            p_customer_email: cleanText(quote.customer_email, 250),
            p_customer_phone: cleanText(quote.customer_phone, 80),
            p_customer_notes: customerNotes,
            p_estimated_total: Number(estimatedTotal.toFixed(2)),
            p_currency: "EUR",
            p_items: crmItems,
          }
        );

        if (crmError || !requestId) {
          console.error("Unable to create AI Concierge CRM request", crmError);
          return NextResponse.json(
            {
              error:
                "I understood the quote request, but I could not save it in the Watermelon CRM. Please try again.",
              code: "CRM_HANDOFF_FAILED",
            },
            { status: 502 }
          );
        }

        crmCreated = true;
        const successMessage =
          cleanText(quote.success_message, 700) ||
          "Your request has been received by Watermelon. Reference: {reference}.";
        finalReply = [finalReply, successMessage.replaceAll("{reference}", crmReference)]
          .filter(Boolean)
          .join("\n\n");
      }
    }

    return NextResponse.json(
      {
        reply: finalReply,
        question: crmCreated ? "" : plan.question || "",
        intentSummary: plan.intent_summary || "",
        recommendations,
        tailorMadeIdeas: (plan.tailor_made_ideas || []).slice(0, 2),
        crmReference: crmReference || "",
        crmCreated,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The AI concierge took too long to reply. Please try again."
        : "The AI concierge is temporarily unavailable.";

    console.error("Watermelon AI concierge error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
