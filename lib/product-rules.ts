export type PricingMode = "per_person" | "group";

export type ProductRules = {
  pricingMode: PricingMode;
  maxGuests: number | null;
};

export function normalizeProductCode(code: string | undefined) {
  return (code || "").trim().toUpperCase().replace(/^WM-/, "");
}

const SOLO_PRICING_PRODUCTS = new Set(["9963P14", "9963P15", "9963P16"]);

export function isSoloPricingProduct(code: string | undefined) {
  return SOLO_PRICING_PRODUCTS.has(normalizeProductCode(code));
}

export function pricingModeFor(priceType: string | undefined, code?: string): PricingMode {
  // These three approved tours have individual price tiers, even when a legacy
  // catalogue import still labels their base price as a group price.
  if (isSoloPricingProduct(code)) return "per_person";
  if (priceType === "Per person" || priceType === "per_person") return "per_person";
  if (["Per group", "per_group", "Per vehicle", "per_vehicle", "Fixed", "fixed"].includes(priceType || "")) return "group";
  throw new Error("The pricing basis must be configured before taking reservations.");
}

export function unitPriceForGuests(price: number, guests: number, mode: PricingMode, code?: string) {
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(guests) || guests < 1) throw new Error("Invalid price or guest count.");
  return mode === "per_person" && guests === 1 && isSoloPricingProduct(code)
    ? Math.round(price * 2 * 100) / 100
    : price;
}

export function priceTotal(price: number, guests: number, mode: PricingMode, code?: string) {
  const unitPrice = unitPriceForGuests(price, guests, mode, code);
  return Math.round((mode === "group" ? unitPrice : unitPrice * guests) * 100) / 100;
}

type ProductRuleInput = {
  code?: string;
  title?: string;
  description?: string;
  optionName?: string;
  optionDescription?: string;
};

const CURRENT_GROUP_OVERRIDES: Record<string, number> = {
  "9963P13": 4,
  "9963P11": 6,
  "9963P17": 4,
  "9963P18": 12,
};

function combinedText(input: ProductRuleInput) {
  return [
    input.title,
    input.description,
    input.optionName,
    input.optionDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function inferMaxGuestsFromText(text: string) {
  if (!text) return null;

  const values: number[] = [];
  const patterns = [
    /(?:up\s*(?:to)?|maximum|max(?:imum)?|limit(?:ed)?\s+to)\s*(\d{1,2})\s*(?:pax|people|persons|guests|travellers|travelers)\b/gi,
    /(\d{1,2})\s*(?:pax|people|persons|guests|travellers|travelers)\s*(?:group|groups)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number.parseInt(match[1] || "", 10);
      if (Number.isFinite(value) && value > 0 && value <= 50) values.push(value);
    }
  }

  for (const match of text.matchAll(
    /(\d{1,2})\s*(?:pax|people|persons|guests|travellers|travelers)?\s*(?:to|-)\s*(\d{1,2})\s*(?:pax|people|persons|guests|travellers|travelers)\b/gi
  )) {
    const value = Number.parseInt(match[2] || "", 10);
    if (Number.isFinite(value) && value > 0 && value <= 50) values.push(value);
  }

  return values.length ? Math.max(...values) : null;
}

export function inferProductRules(input: ProductRuleInput): ProductRules {
  const code = (input.code || "").trim().toUpperCase();
  const text = combinedText(input);

  if (isSoloPricingProduct(code)) return { pricingMode: "per_person", maxGuests: inferMaxGuestsFromText(text) };

  const overrideMax = CURRENT_GROUP_OVERRIDES[code];
  if (overrideMax) {
    return { pricingMode: "group", maxGuests: overrideMax };
  }

  const maxGuests = inferMaxGuestsFromText(text);
  const explicitlyGroupPriced =
    /\bper\s+group\b/i.test(text) ||
    /\bgroup\s+price\b/i.test(text) ||
    /\bprivate\s+group\b/i.test(text) ||
    /\bpax\s+group\b/i.test(text) ||
    /\bfor\s+groups?\b/i.test(text);

  return {
    pricingMode: explicitlyGroupPriced ? "group" : "per_person",
    maxGuests,
  };
}

export function guestLimitLabel(maxGuests: number | null) {
  return maxGuests ? `up to ${maxGuests} guests` : "";
}
