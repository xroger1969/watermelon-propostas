import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watermelon Experiences | Propostas",
  description: "Experiências privadas em Portugal e propostas personalizadas.",
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
            <a className="nav-cta" href="/proposta">Criar proposta</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <div>
            <strong>Watermelon Experiences</strong>
            <p>Experiências privadas e programas personalizados em Portugal.</p>
          </div>
          <div className="footer-note">Catálogo preparado a partir do Supplier Center.</div>
        </footer>
      </body>
    </html>
  );
}
