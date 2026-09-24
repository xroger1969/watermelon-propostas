import type { Metadata } from "next";
import AdminBookings from "@/components/AdminBookings";

export const metadata: Metadata = {
  title: "Bookings & Payments | Watermelon Experiences",
  robots: { index: false, follow: false },
};

export default function AdminBookingsPage() {
  return (
    <main className="admin-page">
      <AdminBookings />
    </main>
  );
}
