"use client";

import { useEffect, useState } from "react";
import styles from "./HeroSlideshow.module.css";

type Slide = {
  code: string;
  label: string;
  fallback: string;
};

type CatalogProduct = {
  code: string;
  image?: string;
};

type CatalogResponse = {
  products?: CatalogProduct[];
};

const SLIDES: Slide[] = [
  {
    code: "9963P16",
    label: "Lisbon",
    fallback:
      "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/7d/4d/36.jpg",
  },
  {
    code: "9963P28",
    label: "Horseback riding on the beach",
    fallback:
      "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/12/55/45/63.jpg",
  },
  {
    code: "9963P32",
    label: "Surf in Costa da Caparica",
    fallback:
      "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/17/04/95/d9.jpg",
  },
  {
    code: "9963P25",
    label: "Portuguese cooking workshop",
    fallback:
      "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/07/95/83/2c.jpg",
  },
];

export default function HeroSlideshow() {
  const [images, setImages] = useState(() => SLIDES.map((slide) => slide.fallback));
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshImages() {
      try {
        const response = await fetch("/api/viator-catalog", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as CatalogResponse;
        if (cancelled || !Array.isArray(data.products)) return;

        const liveImages = new Map(
          data.products
            .filter((product) => product.image)
            .map((product) => [product.code, product.image as string])
        );

        setImages(
          SLIDES.map((slide) => liveImages.get(slide.code) || slide.fallback)
        );
      } catch {
        // Keep the confirmed local Viator photography if live catalogue refresh fails.
      }
    }

    refreshImages();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, 7200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.layer} aria-hidden="true">
      {SLIDES.map((slide, index) => (
        <img
          key={slide.code}
          src={images[index]}
          alt=""
          className={`${styles.slide} ${index === active ? styles.active : ""}`}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
        />
      ))}
      <div className={styles.tint} />
      <div className={styles.texture} />
    </div>
  );
}
