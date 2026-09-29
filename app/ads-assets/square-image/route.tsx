import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#07583f",
        }}
      >
        <img
          src="https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/7d/4d/36.jpg"
          width="1200"
          height="1200"
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
        <div
          style={{
            position: "absolute",
            left: 52,
            bottom: 52,
            width: 210,
            height: 210,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 32,
            background: "rgba(255,255,255,.94)",
          }}
        >
          <img
            src="https://www.watermelonexperiences.pt/watermelon-mark.svg"
            width="165"
            height="165"
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>
    ),
    { width: 1200, height: 1200 }
  );
}
