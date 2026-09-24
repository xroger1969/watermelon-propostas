import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Watermelon Experiences — authentic experiences in Portugal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#f6f4eb", fontFamily: "Arial, sans-serif", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -100, top: -180, width: 560, height: 560, borderRadius: 999, background: "#e8f5ee" }} />
        <div style={{ position: "absolute", right: 105, bottom: -150, width: 390, height: 390, borderRadius: 999, background: "#f8d8d8" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "70px 78px", width: "100%", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 96, height: 96, borderRadius: 999, background: "#fff", border: "5px solid #0b6248", fontSize: 54 }}>🍉</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: "#10281f" }}>Watermelon</div>
              <div style={{ fontSize: 21, letterSpacing: 8, textTransform: "uppercase", color: "#65776e" }}>Experiences</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 850 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#0b6248", marginBottom: 18 }}>Portugal · Local experiences</div>
            <div style={{ fontSize: 67, lineHeight: 1.03, letterSpacing: -2.5, fontWeight: 800, color: "#10281f" }}>Discover Portugal from a different perspective.</div>
            <div style={{ fontSize: 27, lineHeight: 1.4, color: "#53675e", marginTop: 24 }}>Private tours · Food · Beaches · Nature · Culture</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #cad9d1", paddingTop: 24, color: "#0b6248", fontSize: 22, fontWeight: 700 }}>
            <div>Watermelon Experiences</div>
            <div>Personalized proposals available</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
