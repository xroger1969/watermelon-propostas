import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watermelon Experiences Advertising Assets",
  robots: { index: false, follow: false },
};

export default function AdsAssetsPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Watermelon Experiences advertising assets</h1>
      <p>Official brand and campaign assets for advertising platform import.</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24 }}>
        <figure>
          <img src="/ads-assets/logo" alt="Watermelon Experiences square logo" width="600" height="600" style={{ width: "100%", height: "auto" }} />
          <figcaption>Square logo · 1200 × 1200 PNG</figcaption>
        </figure>
        <figure>
          <img src="/ads-assets/square-image" alt="Watermelon Experiences Portugal experience" width="600" height="600" style={{ width: "100%", height: "auto" }} />
          <figcaption>Square campaign image · 1200 × 1200 PNG</figcaption>
        </figure>
        <figure>
          <img src="/opengraph-image" alt="Watermelon Experiences landscape brand image" width="600" height="315" style={{ width: "100%", height: "auto" }} />
          <figcaption>Landscape brand image · 1200 × 630 PNG</figcaption>
        </figure>
      </section>
    </main>
  );
}
