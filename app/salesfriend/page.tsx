import type { Metadata } from "next";
import styles from "./page.module.css";

const title = "SalesFriend demo";
const description =
  "See how SalesFriend uses two photos and AI to simplify vehicle stock entry, reservations and teamwork at your dealership.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["SalesFriend", "vehicle stock", "dealership reservations"],
  alternates: { canonical: "/salesfriend" },
  openGraph: {
    title,
    description,
    url: "/salesfriend",
    siteName: "Watermelon Experiences",
    locale: "en_GB",
    type: "website",
    images: [{ url: "/images/salesfriend-video-poster.jpg", width: 1080, height: 1920, alt: "SalesFriend video demonstration" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/salesfriend-video-poster.jpg"],
  },
};

export default function SalesFriendPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <a className={styles.backLink} href="/">← Back to Watermelon Experiences</a>

        <section className={styles.overview} aria-labelledby="salesfriend-title">
          <div className={styles.copy}>
            <p className={styles.eyebrow}>VEHICLE STOCK &amp; RESERVATIONS</p>
            <h1 id="salesfriend-title">SalesFriend</h1>
            <p className={styles.tagline}>Less time entering data.<br />More time selling.</p>
            <p className={styles.intro}>
              A simple, fast way to manage your dealership stock and reservations.
              See it in action in this short English demo.
            </p>

            <ol className={styles.features}>
              <li>
                <span className={styles.number} aria-hidden="true">01</span>
                <div><h2>Two photos. Vehicle details filled in.</h2><p>Photograph the number plate and price sheet. AI helps create the vehicle record, saving your team time.</p></div>
              </li>
              <li>
                <span className={styles.number} aria-hidden="true">02</span>
                <div><h2>Stock and reservations at a glance.</h2><p>Find vehicles, check their colour-coded status and see who reserved them and how much time remains.</p></div>
              </li>
              <li>
                <span className={styles.number} aria-hidden="true">03</span>
                <div><h2>One shared view for your team.</h2><p>Keep everyone working from the same information, with a history of changes.</p></div>
              </li>
            </ol>
          </div>

          <figure className={styles.demo}>
            <div className={styles.playerFrame}>
              <video
                className={styles.player}
                controls
                playsInline
                preload="metadata"
                width={1080}
                height={1920}
                poster="/images/salesfriend-video-poster.jpg"
                aria-label="SalesFriend English product demonstration"
                aria-describedby="salesfriend-video-caption"
              >
                <source src="/videos/salesfriend-en.mp4" type="video/mp4" />
                <track kind="captions" src="/videos/salesfriend-en.vtt" srcLang="en" label="English" />
                Your browser does not support embedded video. <a href="/videos/salesfriend-en.mp4">Open the SalesFriend demo</a>.
              </video>
            </div>
            <figcaption id="salesfriend-video-caption">English demo · 53 seconds · Includes English captions</figcaption>
            <a className={styles.videoLink} href="/videos/salesfriend-en.mp4" target="_blank" rel="noopener">Open video in a new tab <span aria-hidden="true">↗</span></a>
          </figure>
        </section>

        <details className={styles.transcript}>
          <summary>Read the video transcript</summary>
          <div>
            <p>Meet SalesFriend, the simple, fast way to manage your dealership stock and reservations.</p>
            <p>Adding a vehicle is easy. Take two photos: one of the number plate, and one of the price sheet. AI fills in the vehicle details for you, saving your team valuable time.</p>
            <p>Quickly find the vehicle you&apos;re looking for, check its colour-coded status, view the details, and reserve it in just a few steps.</p>
            <p>See who made each reservation and how much time is left before it expires.</p>
            <p>Your whole team has access to the same information and can track the history of changes.</p>
            <p>Everything stays organised, so every salesperson can focus on what they do best: selling.</p>
            <p>SalesFriend. Less time entering data. More time selling.</p>
          </div>
        </details>
      </div>
    </main>
  );
}
