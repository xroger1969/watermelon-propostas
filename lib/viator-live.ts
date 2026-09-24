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


export type LiveViatorCatalogProduct = {
  code: string;
  title: string;
  description: string;
  image: string;
  url: string;
  duration: string;
  category: string;
  location: string;
  rating?: number;
  reviews?: number;
  options: Array<{
    optionCode: string;
    optionName: string;
    optionDescription: string;
  }>;
};

type ViatorCatalogDuration = {
  fixedDurationInMinutes?: number;
  variableDurationFromMinutes?: number;
  variableDurationToMinutes?: number;
};

type ViatorCatalogResponseProduct = {
  status?: string;
  productCode?: string;
  title?: string;
  description?: string;
  productUrl?: string;
  duration?: ViatorCatalogDuration;
  images?: ViatorProductImage[];
  productOptions?: Array<{
    productOptionCode?: string;
    title?: string;
    description?: string;
  }>;
  reviews?: {
    combinedAverageRating?: number;
    totalReviews?: number;
  };
};

function cleanText(value?: string) {
  return (value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function bestProductImage(images?: ViatorProductImage[]) {
  if (!images?.length) return "";

  const preferred = images.find((image) => image.isCover) || images[0];
  const variants = (preferred.variants || []).filter((variant) => variant.url);
  if (!variants.length) return "";

  const best = variants.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a));
  return best.url || "";
}

function formatMinutes(total?: number) {
  if (!total || total <= 0) return "";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours && minutes) return hours + " h " + minutes + " min";
  if (hours) return hours + " h";
  return minutes + " min";
}

function formatDuration(duration?: ViatorCatalogDuration) {
  if (!duration) return "Duration on request";

  if (duration.fixedDurationInMinutes) {
    return formatMinutes(duration.fixedDurationInMinutes);
  }

  const from = formatMinutes(duration.variableDurationFromMinutes);
  const to = formatMinutes(duration.variableDurationToMinutes);
  if (from && to) return from + "–" + to;
  return from || to || "Duration on request";
}

function inferCategory(title: string, description: string) {
  const value = (title + " " + description).toLowerCase();
  if (/horse|riding|equestrian|carriage/.test(value)) return "Horse Riding";
  if (/dolphin|trawler|boat|sailing|cruise/.test(value)) return "Sea & Dolphins";
  if (/surf|beach|caparica|sunset/.test(value)) return "Beach & Surf";
  if (/cook|food|tile|azulejo|wine|cellar|market/.test(value)) return "Culture & Food";
  if (/arr[aá]bida|set[uú]bal|palmela/.test(value)) return "Arrábida & Setúbal";
  if (/lisbon|lisboa|bel[eé]m/.test(value)) return "Lisbon";
  return "Private Tours";
}

function inferLocation(title: string, description: string) {
  const value = (title + " " + description).toLowerCase();
  if (/sintra|cascais/.test(value)) return "Sintra & Cascais";
  if (/porto/.test(value)) return "Porto";
  if (/azeit[aã]o/.test(value)) return "Azeitão";
  if (/palmela/.test(value)) return "Palmela";
  if (/set[uú]bal/.test(value)) return "Setúbal";
  if (/arr[aá]bida/.test(value)) return "Arrábida";
  if (/caparica|almada|cacilhas/.test(value)) return "Almada & Costa da Caparica";
  if (/lisbon|lisboa|bel[eé]m/.test(value)) return "Lisbon";
  return "Portugal";
}

function candidateProductCodes() {
  const prefix = process.env.VIATOR_SUPPLIER_PRODUCT_PREFIX || "9963P";
  const configuredMax = Number.parseInt(process.env.VIATOR_SUPPLIER_PRODUCT_SCAN_MAX || "250", 10);
  const scanMax = Number.isFinite(configuredMax)
    ? Math.max(1, Math.min(500, configuredMax))
    : 250;

  return Array.from({ length: scanMax }, (_, index) => prefix + String(index + 1));
}

export async function getLiveViatorCatalog(): Promise<LiveViatorCatalogProduct[]> {
  const apiKey = process.env.VIATOR_PARTNER_API_KEY;
  if (!apiKey) throw new Error("VIATOR_PARTNER_API_KEY is not configured");

  const response = await fetch(
    VIATOR_BASE_URL + "/products/bulk?campaign-value=watermelon-site",
    {
      method: "POST",
      headers: {
        "exp-api-key": apiKey,
        "Accept-Language": "en-GB",
        Accept: "application/json;version=2.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productCodes: candidateProductCodes() }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("Viator catalogue request failed with status " + response.status);
  }

  const products = (await response.json()) as ViatorCatalogResponseProduct[];

  return products
    .filter((product) => product.status === "ACTIVE" && product.productCode && product.title)
    .map((product) => {
      const code = product.productCode as string;
      const title = cleanText(product.title);
      const description = cleanText(product.description);
      const options = (product.productOptions || [])
        .filter((option) => option.productOptionCode)
        .map((option) => ({
          optionCode: option.productOptionCode as string,
          optionName: cleanText(option.title) || "Standard option",
          optionDescription: cleanText(option.description),
        }));

      return {
        code,
        title,
        description,
        image: bestProductImage(product.images),
        url: product.productUrl || "",
        duration: formatDuration(product.duration),
        category: inferCategory(title, description),
        location: inferLocation(title, description),
        rating: product.reviews?.combinedAverageRating,
        reviews: product.reviews?.totalReviews,
        options: options.length
          ? options
          : [{ optionCode: "DEFAULT", optionName: "Standard option", optionDescription: "" }],
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
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

const inclusionLabels: Record<string, string> = {
  LUNCH: "Almoço",
  DINNER: "Jantar",
  BREAKFAST: "Pequeno-almoço",
  SNACKS: "Snacks",
  BOTTLED_WATER: "Água engarrafada",
  AIR_CONDITIONED_VEHICLE: "Veículo com ar-condicionado",
  PRIVATE_TRANSPORTATION: "Transporte privado",
  WIFI_ON_BOARD: "Wi-Fi a bordo",
  ALCOHOLIC_BEVERAGES: "Bebidas alcoólicas",
  COFFEE_AND_OR_TEA: "Café e/ou chá",
  PROFESSIONAL_GUIDE: "Guia",
  HOTEL_PICKUP_AND_DROPOFF: "Recolha e regresso ao hotel",
};

function cleanFact(item: { description?: string; typeDescription?: string }) {
  const description = item.description?.trim();
  if (description && description.toLowerCase() !== "other" && description.toLowerCase() !== "outros") return description;
  const type = item.typeDescription?.trim();
  if (!type || type.toLowerCase() === "other" || type.toLowerCase() === "outros") return "";
  return inclusionLabels[type.toUpperCase()] || type.replaceAll("_", " ").toLowerCase().replace(/^./, (char) => char.toUpperCase());
}

type ViatorProductResponse = {
  productCode?: string;
  images?: ViatorProductImage[];
  inclusions?: Array<{ description?: string; typeDescription?: string }>;
  exclusions?: Array<{ description?: string; typeDescription?: string }>;
  logistics?: {
    start?: Array<{ location?: { name?: string; address?: string }; name?: string; address?: string }>;
    travelerPickup?: { pickupOptionType?: string; additionalInfo?: string };
  };
};

export type LiveViatorProduct = {
  code: string;
  images: string[];
  inclusions: string[];
  exclusions: string[];
  meetingPoint?: string;
  pickup?: string;
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

  const inclusions = Array.from(new Set((product.inclusions || []).map(cleanFact).filter(Boolean)));
  const exclusions = Array.from(new Set((product.exclusions || []).map(cleanFact).filter(Boolean)));
  const start = product.logistics?.start?.[0];
  const meetingPoint = start?.location?.name || start?.name || start?.location?.address || start?.address;
  const pickup = product.logistics?.travelerPickup?.additionalInfo;

  return { code: product.productCode, images: uniqueImages, inclusions, exclusions, meetingPoint, pickup };
}
