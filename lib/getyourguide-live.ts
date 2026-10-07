import type { MarketplaceCatalogProduct } from "@/types/marketplace";

const GETYOURGUIDE_BASE_URL = "https://api.getyourguide.com/1";
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_PARTNER_CONTACT_EMAIL = "info@watermelonexperiences.pt";

type GetYourGuidePicture = {
  url?: string;
  ssl_url?: string;
};

type GetYourGuidePrice = {
  values?: {
    amount?: number;
  };
  description?: string;
};

type GetYourGuideDuration = {
  duration?: number;
  unit?: "day" | "hour" | "minute";
};

type GetYourGuideLocation = {
  name?: string;
  city?: string;
  country?: string;
};

type GetYourGuideTour = {
  tour_id?: number;
  title?: string;
  abstract?: string;
  description?: string;
  pictures?: GetYourGuidePicture[];
  price?: GetYourGuidePrice;
  overall_rating?: number;
  number_of_ratings?: number;
  durations?: GetYourGuideDuration[];
  url?: string;
  locations?: GetYourGuideLocation[];
  categories?: Array<{ name?: string }>;
};

type GetYourGuideTourResponse = {
  data?: {
    tours?: GetYourGuideTour[];
  };
};

function token() {
  return process.env.GETYOURGUIDE_PARTNER_API_TOKEN?.trim() || "";
}

function partnerContactEmail() {
  return process.env.GETYOURGUIDE_PARTNER_CONTACT_EMAIL?.trim() || DEFAULT_PARTNER_CONTACT_EMAIL;
}

function configuredTourIds() {
  return (process.env.GETYOURGUIDE_TOUR_IDS || "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function cleanText(value?: string) {
  return (value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function durationLabel(durations?: GetYourGuideDuration[]) {
  const first = durations?.find((item) => Number(item.duration) > 0 && item.unit);
  if (!first?.duration || !first.unit) return "Duration on request";

  const amount = Number(first.duration);
  const unit =
    first.unit === "day"
      ? amount === 1 ? "day" : "days"
      : first.unit === "hour"
        ? amount === 1 ? "hour" : "hours"
        : amount === 1 ? "minute" : "minutes";

  return amount + " " + unit;
}

function locationLabel(locations?: GetYourGuideLocation[]) {
  const first = locations?.find((item) => item.name || item.city || item.country);
  return cleanText(first?.name || first?.city || first?.country) || "Portugal";
}

function imageUrl(pictures?: GetYourGuidePicture[]) {
  const raw = pictures?.map((picture) => picture.ssl_url || picture.url).find(Boolean) || "";
  return raw.includes("[format_id]") ? "" : raw;
}

function normalizeTour(tour: GetYourGuideTour): MarketplaceCatalogProduct | null {
  if (!tour.tour_id || !tour.title) return null;

  const amount = Number(tour.price?.values?.amount);
  const price = Number.isFinite(amount) && amount > 0 ? amount : null;

  return {
    provider: "getyourguide",
    externalId: String(tour.tour_id),
    title: cleanText(tour.title),
    description: cleanText(tour.abstract || tour.description),
    image: imageUrl(tour.pictures),
    url: tour.url || "",
    duration: durationLabel(tour.durations),
    category: cleanText(tour.categories?.[0]?.name) || "Experiences",
    location: locationLabel(tour.locations),
    price,
    currency: "EUR",
    rating: Number.isFinite(Number(tour.overall_rating)) ? Number(tour.overall_rating) : undefined,
    reviews: Number.isFinite(Number(tour.number_of_ratings)) ? Number(tour.number_of_ratings) : undefined,
  };
}

async function request(path: string) {
  const apiToken = token();
  if (!apiToken) throw new Error("GETYOURGUIDE_PARTNER_API_TOKEN is not configured");

  const response = await fetch(GETYOURGUIDE_BASE_URL + path, {
    headers: {
      "X-ACCESS-TOKEN": apiToken,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error("GetYourGuide API returned " + response.status);
  }

  return (await response.json()) as GetYourGuideTourResponse;
}

export function getGetYourGuideIntegrationStatus() {
  const ids = configuredTourIds();

  return {
    provider: "getyourguide" as const,
    configured: Boolean(token()),
    enabled: Boolean(token()) && ids.length > 0,
    mode: ids.length > 0 ? "configured-tour-ids" : "awaiting-tour-ids",
    productCount: ids.length,
    contactEmail: partnerContactEmail(),
  };
}

export async function getLiveGetYourGuideProduct(tourId: number) {
  const params = new URLSearchParams({
    cnt_language: "en",
    currency: "EUR",
    preformatted: "full",
  });
  const payload = await request("/tours/" + encodeURIComponent(String(tourId)) + "?" + params.toString());
  const tour = payload.data?.tours?.[0];
  return tour ? normalizeTour(tour) : null;
}

export async function getLiveGetYourGuideCatalog(): Promise<MarketplaceCatalogProduct[]> {
  const ids = configuredTourIds();
  if (!token()) throw new Error("GETYOURGUIDE_PARTNER_API_TOKEN is not configured");
  if (!ids.length) return [];

  const results = await Promise.allSettled(ids.map((tourId) => getLiveGetYourGuideProduct(tourId)));

  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
}

export async function searchLiveGetYourGuideCatalog(
  query: string,
  limit = 12
): Promise<MarketplaceCatalogProduct[]> {
  const safeQuery = query.trim().slice(0, 150);
  if (!safeQuery) return [];

  const params = new URLSearchParams({
    q: safeQuery,
    cnt_language: "en",
    currency: "EUR",
    preformatted: "teaser",
    limit: String(Math.max(1, Math.min(50, limit))),
  });

  const payload = await request("/tours?" + params.toString());
  return (payload.data?.tours || [])
    .map(normalizeTour)
    .filter((item): item is MarketplaceCatalogProduct => Boolean(item));
}
