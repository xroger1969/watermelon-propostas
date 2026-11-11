import { viatorListings } from "../data/viator";
import { isSoloPricingProduct, normalizeProductCode } from "./product-rules";

type Tariff = { price?: number | null; currency?: string };

// Direct Watermelon tariffs for the selected tours are operator-owned. A
// partner's current selling price must not silently change the solo tier.
export function directCatalogTariff(code: string, studio?: Tariff, partner?: Tariff) {
  const reference = viatorListings[isSoloPricingProduct(code) ? normalizeProductCode(code) : code];
  const live = isSoloPricingProduct(code) ? undefined : partner;
  return {
    price: studio ? studio.price ?? null : live?.price ?? reference?.price ?? null,
    currency: studio?.currency || live?.currency || reference?.currency || "EUR",
  };
}
