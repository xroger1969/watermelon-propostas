import { NextResponse } from "next/server";
import { getLiveViatorProduct } from "@/lib/viator-live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim();

  if (!code || !/^9963P\d+$/i.test(code)) {
    return NextResponse.json({ error: "Invalid product code" }, { status: 400 });
  }

  try {
    const product = await getLiveViatorProduct(code);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch Viator product";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
