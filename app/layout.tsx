import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://watermelon-propostas.vercel.app"),
  title: "Watermelon Experiences | Tours e experiências em Portugal",
  description: "Tours privados, praia, mar, gastronomia e experiências a cavalo em Portugal.",
  icons: {
    icon: "/watermelon-mark.svg",
  },
  openGraph: {
    title: "Watermelon Experiences",
    description: "Experiências para descobrir Portugal de outra forma.",
    url: "https://watermelon-propostas.vercel.app",
    siteName: "Watermelon Experiences",
    locale: "pt_PT",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
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

          <nav className="main-nav" aria-label="Navegação principal">
            <a href="/#experiencias">Experiências</a>
            <a className="nav-cta" href="/proposta">Proposta personalizada</a>
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
            <p>Experiências privadas e programas personalizados em Portugal.</p>
          </div>
          <div className="footer-note">Preços sujeitos a disponibilidade na Viator.</div>
        </footer>
      </body>
    </html>
  );
}
