"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";

const PRIVATE_PREFIXES = ["/crm", "/admin", "/api", "/ads-assets"];

export default function SiteAnalytics() {
  const pathname = usePathname();
  const lastTracked = useRef("");
  const inFlight = useRef(false);

  const trackCurrentPage = useCallback(async () => {
    const path = pathname || "/";
    if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
    if (lastTracked.current === path || inFlight.current) return;

    inFlight.current = true;
    const tracked = await trackAnalyticsEvent("page_view");
    inFlight.current = false;

    if (tracked) lastTracked.current = path;
  }, [pathname]);

  useEffect(() => {
    void trackCurrentPage();
  }, [trackCurrentPage]);

  useEffect(() => {
    const onConsentChanged = () => {
      void trackCurrentPage();
    };

    window.addEventListener("watermelon-consent-changed", onConsentChanged);
    return () =>
      window.removeEventListener("watermelon-consent-changed", onConsentChanged);
  }, [trackCurrentPage]);

  return null;
}
