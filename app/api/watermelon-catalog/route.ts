import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const feedUrl = process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;

  if (!feedUrl) {
    return NextResponse.json(
      { products: [], source: "legacy-fallback", error: "Product Studio feed is not configured" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { products: [], source: "legacy-fallback", error: "Product Studio feed unavailable" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await response.json();
    const products = Array.isArray(data?.products) ? data.products : [];

    return NextResponse.json(
      {
        products,
        source: "watermelon-product-studio",
        updatedAt: data?.publishedAt || new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Product Studio catalog bridge failed", error);
    return NextResponse.json(
      { products: [], source: "legacy-fallback", error: "Product Studio feed unavailable" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
