"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AdminAccessButton from "@/components/AdminAccessButton";

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPrivateAdmin = pathname?.startsWith("/admin");

  if (isPrivateAdmin) {
    return <>{children}</>;
  }

  return (
    <>
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
          <AdminAccessButton />
          <a className="nav-cta" href="/proposta">Request a personalized proposal</a>
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
    </>
  );
}
