import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { experiences } from "@/data/products";
import { viatorListings } from "@/data/viator";
import {
  getLiveViatorCatalog,
  getLiveViatorPrices,
  type LiveViatorCatalogProduct,
} from "@/lib/viator-live";

export const dynamic = "force-dynamic";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIRecommendation = {
  code: string;
  reason: string;
};

type AIPlan = {
  reply: string;
  question: string;
  intent_summary: string;
  recommendations: AIRecommendation[];
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

CRITICAL OPERATING MODE: CLOSED WORLD.
The supplied WATERMELON CATALOGUE is the complete universe of experiences you are allowed to discuss, recommend, combine or describe as available. Your job is NOT to brainstorm general Portugal travel ideas. Your job is to understand the traveller and match that request only to products that Watermelon currently has active.

Rules:
- Recommend ONLY product codes that exist in the supplied WATERMELON CATALOGUE.
- Never suggest, offer, propose or imply any experience, activity, attraction, restaurant, hotel, transfer, excursion, stop, route or service that is not explicitly represented in the supplied catalogue.
- Never say "we can arrange", "we can add", "you could also do", "consider", "another idea is", or similar language for something outside the current catalogue.
- Do not use general travel knowledge to enrich a Watermelon product. A fact may be stated only if it is supported by that product's supplied title, description, category, location, duration or current price data.
- Do not infer inclusions from a category or location. For example, do not infer a tasting from a winery visit, lunch from a food category, transfer from a tour, or a beach stop from a coastal location unless the supplied product data explicitly says so.
- If the traveller asks for something that is not present in the catalogue, say clearly that Watermelon does not currently have that experience available. You may then show the closest AVAILABLE Watermelon match only if one genuinely fits; otherwise recommend nothing.
- If there is no good catalogue match, return zero recommendations. Never fill the gap with external ideas.
- Never mention competitors.
- Never invent availability, exact prices, inclusions, pickup, accessibility, child suitability, opening hours or booking confirmation.
- "priceFrom" is only a guide. If it is null, say the price will be confirmed on request.
- Be concise, warm, premium and practical.
- Reply in the same language as the traveller.
- Personalize recommendations to group type, ages, dates, duration, interests, mobility, pickup area and budget when those details are known.
- Explain WHY each recommendation fits, using only the traveller's stated preferences and facts supplied for that catalogue product.
- If the traveller is vague, ask ONE high-value follow-up question rather than inventing an itinerary.
- If the traveller is specific, answer directly and only ask a question if it materially improves the catalogue match.
- Recommend 0 to 4 experiences. Prefer 2 or 3 only when there are genuinely strong catalogue matches.
- Do not claim that a reservation has been made. Watermelon reviews and confirms availability before booking.
- For unrelated requests, briefly explain that you can help only with currently available Watermelon Experiences.
- Keep reply under about 120 words. Keep the follow-up question short.
`;

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
  },
  required: ["reply", "question", "intent_summary", "recommendations"],
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

    const catalogueContext =
      "WATERMELON CATALOGUE (current products only):\n" +
      JSON.stringify(compactCatalogue(catalogue));

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

    return NextResponse.json(
      {
        reply: plan.reply || "",
        question: plan.question || "",
        intentSummary: plan.intent_summary || "",
        recommendations,
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
