import { NextResponse } from "next/server";
import { currentViatorCodes } from "@/data/viator";
import { getLiveViatorPrices } from "@/lib/viator-live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prices = await getLiveViatorPrices(currentViatorCodes);

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
