export type LiveViatorPrice = {
  code: string;
  price: number;
  currency: string;
};

type ViatorSchedule = {
  productCode?: string;
  currency?: string;
  summary?: {
    fromPrice?: number;
  };
};

const VIATOR_BASE_URL = "https://api.viator.com/partner";

export async function getLiveViatorPrices(productCodes: string[]): Promise<LiveViatorPrice[]> {
  const apiKey = process.env.VIATOR_PARTNER_API_KEY;

  if (!apiKey) {
    throw new Error("VIATOR_PARTNER_API_KEY is not configured");
  }

  const response = await fetch(`${VIATOR_BASE_URL}/availability/schedules/bulk`, {
    method: "POST",
    headers: {
      "exp-api-key": apiKey,
      "Accept-Language": "pt-PT",
      Accept: "application/json;version=2.0",
      "Content-Type": "application/json;version=2.0",
    },
    body: JSON.stringify({ productCodes }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Viator API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  const schedules: ViatorSchedule[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.availabilitySchedules)
      ? json.availabilitySchedules
      : Array.isArray(json?.data)
        ? json.data
        : [];

  return schedules
    .map((schedule) => {
      const price = Number(schedule?.summary?.fromPrice);
      const code = schedule?.productCode;

      if (!code || !Number.isFinite(price)) return null;

      return {
        code,
        price,
        currency: schedule.currency || "EUR",
      };
    })
    .filter((item): item is LiveViatorPrice => Boolean(item));
}
