import { NextResponse } from "next/server";
import { getGetYourGuideIntegrationStatus } from "@/lib/getyourguide-live";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      contactEmail: "info@watermelonexperiences.pt",
      providers: [
        {
          provider: "watermelon",
          configured: true,
          enabled: true,
          mode: "direct-booking",
        },
        {
          provider: "viator",
          configured: Boolean(process.env.VIATOR_PARTNER_API_KEY),
          enabled: Boolean(process.env.VIATOR_PARTNER_API_KEY),
          mode: "partner-api",
        },
        getGetYourGuideIntegrationStatus(),
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
