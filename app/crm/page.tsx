import type { Metadata } from "next";
import AdminCRM from "@/components/AdminCRM";

export const metadata: Metadata = {
  title: "Watermelon CRM",
  description: "Watermelon private CRM",
  robots: { index: false, follow: false },
  manifest: "/crm.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Watermelon CRM",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
};

export default function CRMPage() {
  return (
    <main className="admin-page">
      <AdminCRM />
    </main>
  );
}
