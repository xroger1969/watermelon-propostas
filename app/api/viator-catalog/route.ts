import { NextResponse } from "next/server";
import { getLiveViatorCatalog } from "@/lib/viator-live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getLiveViatorCatalog();

    return NextResponse.json(
      {
        products,
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
    const message = error instanceof Error ? error.message : "Unable to fetch Viator catalogue";

    return NextResponse.json(
      {
        products: [],
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
