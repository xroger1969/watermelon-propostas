import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Watermelon Experiences — Discover Portugal from a different perspective";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "linear-gradient(125deg,#07583f 0%,#0c6246 55%,#477d45 100%)", fontFamily: "Arial, sans-serif" }}>
        <div style={{ position:"absolute", right:-120, top:-150, width:650, height:650, borderRadius:999, background:"rgba(255,255,255,.035)" }} />
        <div style={{ position:"absolute", right:-50, bottom:-310, width:900, height:620, borderRadius:"50%", border:"2px solid rgba(255,255,255,.07)" }} />
        <div style={{ display:"flex", flexDirection:"column", width:"100%", padding:"52px 48px", zIndex:2 }}>
          <img src="https://www.watermelonexperiences.pt/watermelon-mark.svg" width="235" height="235" style={{ objectFit:"contain", alignSelf:"flex-start", marginBottom:32 }} />
          <div style={{ color:"#f2f4ef", fontSize:31, fontWeight:700, letterSpacing:8, marginBottom:54 }}>WATERMELON EXPERIENCES · PORTUGAL</div>
          <div style={{ color:"#ffffff", fontSize:82, lineHeight:1.03, letterSpacing:-4, fontWeight:800, maxWidth:1120 }}>Discover Portugal from<br/>a different perspective.</div>
        </div>
      </div>
    ),
    size
  );
}
