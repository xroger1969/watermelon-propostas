import { inferProductRules, isSoloPricingProduct, normalizeProductCode, pricingModeFor, type ProductRules } from "./product-rules";
import { directCatalogTariff } from "./catalog-tariff";

type StudioOption = { optionCode: string; optionName: string; price?: number | null; currency?: string; priceType?: string; capacity?: number | null };
type StudioProduct = { code: string; id?: string; title: string; description?: string; destination?: string; category?: string; duration?: string; image?: string; maxGuests?: number | null; price?: number | null; currency?: string; priceType?: string; options?: StudioOption[] };

// This feed is server-owned. Never derive a Studio price from customer text.
export async function loadStudioCatalog(): Promise<StudioProduct[]> {
  const url = process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;
  if (!url) return [];
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("The current catalogue could not be verified. Please try again.");
  const data = await response.json();
  if (!Array.isArray(data.products)) throw new Error("Invalid catalogue response.");
  return data.products;
}

export function resolveCatalogPricing(products: StudioProduct[], input: { code: string; optionCode?: string; title?: string; optionName?: string }): ProductRules & { studio: boolean; price?: number | null; currency?: string; primaryOption?: boolean } {
  const product = products.find(p => p.code === input.code || p.id === input.code || (isSoloPricingProduct(input.code) && normalizeProductCode(p.code) === normalizeProductCode(input.code)));
  if (!product) {
    // The selected tours have an operator-approved reference tariff. Never use
    // a customer's supplied amount as their fallback selling price.
    const reference = isSoloPricingProduct(input.code) ? directCatalogTariff(input.code) : undefined;
    return { ...inferProductRules(input), studio: false, ...(reference || {}) };
  }
  const option = product.options?.find(o => o.optionCode === input.optionCode);
  if (product.options?.length && !option) throw new Error("This option is no longer available. Please refresh the experience page.");
  const limits = [product.maxGuests, option?.capacity].filter((n): n is number => typeof n === "number" && n > 0);
  return {
    studio: true,
    pricingMode: pricingModeFor(option?.priceType || product.priceType, input.code),
    maxGuests: limits.length ? Math.min(...limits) : null,
    price: option ? option.price ?? null : product.price ?? null,
    currency: option?.currency || product.currency || "EUR",
    primaryOption: !option || option.optionCode === product.options?.[0]?.optionCode,
  };
}
