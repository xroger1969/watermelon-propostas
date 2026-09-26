import type { Metadata } from "next";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.watermelonexperiences.pt"),
  title: {
    default: "Watermelon Experiences | Private Tours & Experiences in Portugal",
    template: "%s | Watermelon Experiences",
  },
  description: "Discover private tours, food, beaches, nature and authentic local experiences in Lisbon, Arrábida, Setúbal and across Portugal.",
  keywords: ["Portugal tours", "Lisbon private tours", "Costa da Caparica experiences", "Arrábida tours", "Setúbal tours", "Portuguese food experiences", "Watermelon Experiences"],
  alternates: { canonical: "/" },
  icons: {
    icon: "/watermelon-mark.svg",
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Watermelon Experiences",
    description: "Private tours, food, beaches, nature and authentic local experiences in Lisbon and across Portugal.",
    url: "https://www.watermelonexperiences.pt",
    siteName: "Watermelon Experiences",
    locale: "en_GB",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Watermelon Experiences — authentic experiences in Portugal" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Watermelon Experiences | Portugal",
    description: "Private tours and authentic local experiences in Lisbon and across Portugal.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
