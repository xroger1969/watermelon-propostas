export type LiveViatorPrice = {
  code: string;
  price: number;
  currency: string;
};

type PricePart = {
  recommendedRetailPrice?: number;
};

type PricingDetail = {
  ageBand?: string;
  price?: {
    original?: PricePart;
    special?: PricePart;
  };
};

type PricingRecord = {
  pricingDetails?: PricingDetail[];
};

type Season = {
  pricingRecords?: PricingRecord[];
};

type BookableItem = {
  seasons?: Season[];
};

type ViatorSchedule = {
  productCode?: string;
  currency?: string;
  summary?: {
    fromPrice?: number;
  };
  bookableItems?: BookableItem[];
};

const VIATOR_BASE_URL = "https://api.viator.com/partner";

function findFallbackPrice(schedule: ViatorSchedule): number | null {
  const preferred: number[] = [];
  const fallback: number[] = [];

  for (const item of schedule.bookableItems || []) {
    for (const season of item.seasons || []) {
      for (const record of season.pricingRecords || []) {
        for (const detail of record.pricingDetails || []) {
          const special = Number(detail.price?.special?.recommendedRetailPrice);
          const original = Number(detail.price?.original?.recommendedRetailPrice);
          const value = Number.isFinite(special) && special > 0
            ? special
            : Number.isFinite(original) && original > 0
              ? original
              : null;

          if (value === null) continue;

          const band = (detail.ageBand || "").toUpperCase();
          if (band === "ADULT" || band === "TRAVELER") {
            preferred.push(value);
          } else {
            fallback.push(value);
          }
        }
      }
    }
  }

  const candidates = preferred.length ? preferred : fallback;
  return candidates.length ? Math.min(...candidates) : null;
}

async function getSchedule(productCode: string, apiKey: string): Promise<LiveViatorPrice | null> {
  const response = await fetch(
    `${VIATOR_BASE_URL}/availability/schedules/${encodeURIComponent(productCode)}`,
    {
      method: "GET",
      headers: {
        "exp-api-key": apiKey,
        "Accept-Language": "pt-PT",
        Accept: "application/json;version=2.0",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return null;
  }

  const schedule = (await response.json()) as ViatorSchedule;
  const summaryPrice = Number(schedule.summary?.fromPrice);
  const price = Number.isFinite(summaryPrice) && summaryPrice > 0
    ? summaryPrice
    : findFallbackPrice(schedule);

  if (!schedule.productCode || price === null) {
    return null;
  }

  return {
    code: schedule.productCode,
    price,
    currency: schedule.currency || "EUR",
  };
}

export async function getLiveViatorPrices(productCodes: string[]): Promise<LiveViatorPrice[]> {
  const apiKey = process.env.VIATOR_PARTNER_API_KEY;

  if (!apiKey) {
    throw new Error("VIATOR_PARTNER_API_KEY is not configured");
  }

  const results = await Promise.allSettled(
    productCodes.map((productCode) => getSchedule(productCode, apiKey))
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
}


type ViatorProductImageVariant = {
  height?: number;
  width?: number;
  url?: string;
};

type ViatorProductImage = {
  isCover?: boolean;
  variants?: ViatorProductImageVariant[];
};

type ViatorProductResponse = {
  productCode?: string;
  images?: ViatorProductImage[];
};

export type LiveViatorProduct = {
  code: string;
  images: string[];
};

export async function getLiveViatorProduct(productCode: string): Promise<LiveViatorProduct | null> {
  const apiKey = process.env.VIATOR_PARTNER_API_KEY;
  if (!apiKey) throw new Error("VIATOR_PARTNER_API_KEY is not configured");

  const response = await fetch(`${VIATOR_BASE_URL}/products/${encodeURIComponent(productCode)}`, {
    method: "GET",
    headers: {
      "exp-api-key": apiKey,
      "Accept-Language": "pt-PT",
      Accept: "application/json;version=2.0",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) return null;

  const product = (await response.json()) as ViatorProductResponse;
  const images = (product.images || []).flatMap((image) => {
    const variants = (image.variants || []).filter((variant) => variant.url);
    if (!variants.length) return [];
    const best = variants.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a));
    return best.url ? [best.url] : [];
  });

  const uniqueImages = Array.from(new Set(images));
  if (!product.productCode) return null;

  return { code: product.productCode, images: uniqueImages };
}
