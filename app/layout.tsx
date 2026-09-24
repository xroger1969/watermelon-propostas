import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://watermelon-propostas.vercel.app"),
  title: "Watermelon Experiences | Tours & experiences in Portugal",
  description: "Private tours, beach, sea, food and horseback riding experiences in Portugal.",
  icons: {
    icon: "/watermelon-mark.svg",
  },
  openGraph: {
    title: "Watermelon Experiences",
    description: "Experiences to discover Portugal from a different perspective.",
    url: "https://watermelon-propostas.vercel.app",
    siteName: "Watermelon Experiences",
    locale: "en_GB",
    type: "website",
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
