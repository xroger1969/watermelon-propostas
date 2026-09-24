import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Watermelon Experiences — private experiences in Portugal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#071f19", fontFamily: "Arial, sans-serif" }}>
        <div style={{ position: "absolute", right: -90, top: -130, width: 600, height: 600, borderRadius: 999, background: "#0d382c" }} />
        <div style={{ position: "absolute", right: 135, top: 110, width: 330, height: 330, borderRadius: 999, background: "#ed1d4f", border: "20px solid #ffffff", boxShadow: "0 0 0 34px #45b649", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 180, lineHeight: 1 }}>🍉</div>
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 12, background: "#45b649" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "70px 76px", width: "760px", zIndex: 2 }}>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 72 }}>
            <div style={{ fontSize: 49, fontWeight: 800, color: "#ffffff", letterSpacing: -1 }}>Watermelon</div>
            <div style={{ fontSize: 19, letterSpacing: 10, color: "#a9c5ba", textTransform: "uppercase" }}>Experiences</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#6fd080", marginBottom: 18 }}>Portugal</div>
          <div style={{ fontSize: 61, lineHeight: 1.04, fontWeight: 800, color: "#ffffff", letterSpacing: -2 }}>Private experiences, made personal.</div>
          <div style={{ fontSize: 25, lineHeight: 1.4, color: "#c8d9d2", marginTop: 24 }}>Tours · Food · Sea · Beaches · Nature</div>
        </div>
      </div>
    ),
    size
  );
}
