import { NextResponse } from "next/server";
import { getLiveGetYourGuideProduct } from "@/lib/getyourguide-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rawTourId = new URL(request.url).searchParams.get("tourId")?.trim() || "";

  if (!/^\d+$/.test(rawTourId)) {
    return NextResponse.json({ error: "Invalid GetYourGuide tour id" }, { status: 400 });
  }

  try {
    const product = await getLiveGetYourGuideProduct(Number(rawTourId));

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch GetYourGuide product";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
