import type { Metadata } from "next";
import BookingRequest from "@/components/BookingRequest";

export const metadata: Metadata = {
  title: "Request a Booking | Watermelon Experiences",
  description: "Send a direct booking request to Watermelon Experiences. Availability is checked manually before confirmation.",
};

export default function BookingPage() {
  return (
    <main>
      <section className="proposal-hero">
        <p className="eyebrow">WATERMELON EXPERIENCES</p>
        <h1>Request your experience.</h1>
        <p>
          Choose your date and preferences. We will check availability and confirm your booking personally.
        </p>
      </section>
      <BookingRequest />
    </main>
  );
}
