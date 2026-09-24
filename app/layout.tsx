import type { Metadata } from "next";
import "./globals.css";

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
        <header className="site-header">
          <a className="brand" href="/" aria-label="Watermelon Experiences">
            <span className="brand-logo-wrap">
              <img src="/watermelon-mark.svg" alt="" className="brand-logo" />
            </span>
            <span className="brand-copy">
              <strong>Watermelon</strong>
              <small>Experiences</small>
            </span>
          </a>

          <nav className="main-nav" aria-label="Main navigation">
            <a href="/#experiencias">Experiences</a>
            <a className="nav-cta" href="/proposta">Personalized proposal</a>
          </nav>
        </header>

        {children}

        <footer className="site-footer">
          <div className="footer-brand">
            <div className="footer-brand-line">
              <img src="/watermelon-mark.svg" alt="" className="footer-mark" />
              <div>
                <strong>WATERMELON</strong>
                <span>EXPERIENCES</span>
              </div>
            </div>
            <p>Private experiences and personalized programs in Portugal.</p>
          </div>
          <div className="footer-note">Prices and availability subject to confirmation.</div>
        </footer>
      </body>
    </html>
  );
}
