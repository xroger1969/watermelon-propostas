import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watermelon Experiences | Tours e experiências em Portugal",
  description: "Tours privados, praia, mar, gastronomia e experiências a cavalo em Portugal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>
        <header className="site-header">
          <a className="brand" href="/">
            <span className="brand-mark">W</span>
            <span>
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
          <div>
            <strong>Watermelon Experiences</strong>
            <p>Experiências privadas e programas personalizados em Portugal.</p>
          </div>
          <div className="footer-note">Preços sujeitos a disponibilidade na Viator.</div>
        </footer>
      </body>
    </html>
  );
}
