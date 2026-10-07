import { NextResponse } from "next/server";
import {
  getGetYourGuideIntegrationStatus,
  getLiveGetYourGuideCatalog,
} from "@/lib/getyourguide-live";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getGetYourGuideIntegrationStatus();

  if (!status.configured) {
    return NextResponse.json(
      {
        products: [],
        source: "getyourguide-disabled",
        integration: status,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const products = await getLiveGetYourGuideCatalog();

    return NextResponse.json(
      {
        products,
        source: "getyourguide-partner-api",
        integration: status,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch GetYourGuide catalogue";

    return NextResponse.json(
      {
        products: [],
        source: "getyourguide-error",
        integration: status,
        error: message,
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
