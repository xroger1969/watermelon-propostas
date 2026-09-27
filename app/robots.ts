import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/crm/",
          "/api/",
          "/payment/",
          "/proposal/",
          "/reserva/",
        ],
      },
    ],
    sitemap: "https://www.watermelonexperiences.pt/sitemap.xml",
    host: "https://www.watermelonexperiences.pt",
  };
}
