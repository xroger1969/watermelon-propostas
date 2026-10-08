import type { Metadata } from "next";
import AdminPromotions from "@/components/AdminPromotions";

export const metadata: Metadata = {
  title: "Website Promotions",
  description: "Watermelon private website promotion manager",
  robots: { index: false, follow: false },
};

export default function PromotionsPage() {
  return (
    <main className="admin-page">
      <AdminPromotions />
    </main>
  );
}
