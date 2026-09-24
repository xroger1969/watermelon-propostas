import { NextResponse } from "next/server";
import { currentViatorCodes } from "@/data/viator";
import { getLiveViatorCatalog, getLiveViatorPrices } from "@/lib/viator-live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let productCodes = currentViatorCodes;

    try {
      const catalog = await getLiveViatorCatalog();
      if (catalog.length) {
        productCodes = catalog.map((product) => product.code);
      }
    } catch {
      // Keep the confirmed static code list if catalogue discovery is temporarily unavailable.
    }

    const prices = await getLiveViatorPrices(productCodes);

    return NextResponse.json(
      {
        prices,
        updatedAt: new Date().toISOString(),
        source: "viator-partner-api",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch Viator prices";

    return NextResponse.json(
      {
        prices: [],
        source: "static-fallback",
        error: message,
      },
      {
        status: process.env.VIATOR_PARTNER_API_KEY ? 502 : 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
