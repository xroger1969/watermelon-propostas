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
  try {
    const live = await getLiveViatorCatalog();
    if (live.length) return liveToCatalogue(live);
  } catch {
    // Fall back to the confirmed local catalogue when Viator is temporarily unavailable.
  }

  return staticCatalogue();
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

Your commercial goal is to help the traveller confidently choose relevant WATERMELON experiences and move toward a proposal or booking without being pushy.

Rules:
- Recommend ONLY product codes that exist in the supplied WATERMELON CATALOGUE.
- Never invent availability, exact prices, inclusions, pickup, accessibility, child suitability, opening hours or booking confirmation.
- "priceFrom" is only a guide. If it is null, say price is confirmed on request.
- Be concise, warm, premium and practical.
- Reply in the same language as the traveller.
- Personalize recommendations to group type, ages, dates, duration, interests, mobility, pickup area and budget when those details are known.
- Explain WHY each recommendation fits the traveller.
- If the traveller is vague, take initiative: give useful likely matches and ask ONE high-value follow-up question.
- If the traveller is specific, answer directly and only ask a question if it materially improves the plan.
- Recommend 0 to 4 experiences. Prefer 2 or 3 when there are strong matches.
- Do not recommend competitors or experiences outside the supplied catalogue.
- Do not claim that a reservation has been made. Watermelon reviews and confirms availability before booking.
- For unrelated requests, briefly steer the conversation back to planning experiences in Portugal.
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
