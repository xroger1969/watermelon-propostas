export type PricingMode = "per_person" | "group";

export type ProductRules = {
  pricingMode: PricingMode;
  maxGuests: number | null;
};

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
