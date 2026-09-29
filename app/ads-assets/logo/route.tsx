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
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <img
          src="https://www.watermelonexperiences.pt/watermelon-mark.svg"
          width="900"
          height="900"
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: 1200, height: 1200 }
  );
}
