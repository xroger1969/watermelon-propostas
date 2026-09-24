export type ViatorListing = {
  code: string;
  title: string;
  price: number;
  currency: "EUR";
  image: string;
  url: string;
  duration: string;
  rating?: number;
  reviews?: number;
};

export const viatorListings: Record<string, ViatorListing> = {
  "9963P14": {
    code: "9963P14",
    title: "Private Tour South of Lisbon — Cacilhas, Almada & Costa da Caparica",
    price: 90,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/06/d7/d1/15.jpg",
    url: "https://www.viator.com/en-GB/tours/Almada/Cacilhas-Almada-Costa-da-Caparica-Half-Day-Tour-from-Lisbon/d51024-9963P14",
    duration: "3–4 h",
    rating: 5,
    reviews: 4
  },
  "9963P25": {
    code: "9963P25",
    title: "Portuguese Cooking Class at a Local Market",
    price: 150,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/07/95/83/2c.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Food-Tour-Cooking-Class-and-Lunch-at-a-Market-with-Local-Market-Tour/d538-9963P25",
    duration: "6 h",
    rating: 5,
    reviews: 3
  },
  "9963P13": {
    code: "9963P13",
    title: "Arrábida Private Half-Day Tour",
    price: 350,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/07/90/a7/88.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Arrabida-Tour-Half-Day/d538-9963P13",
    duration: "4 h"
  },
  "9963P23": {
    code: "9963P23",
    title: "Beach Day & Lunch — All Inclusive",
    price: 180,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/06/bd/bd/c3.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Beach-day-and-Sushi-all-Inclusive/d538-9963P23",
    duration: "Duration on request"
  },
  "9963P11": {
    code: "9963P11",
    title: "Arrábida Private Full-Day Tour",
    price: 350,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/07/90/a5/c4.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Arrabida-Tour/d538-9963P11",
    duration: "6–7 h"
  },
  "9963P17": {
    code: "9963P17",
    title: "Porto from Lisbon — Private Full-Day Tour",
    price: 750,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/06/75/c5/a3.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Tour-Porto-Full-Day-Up-to-8-people/d538-9963P17",
    duration: "9–10 h"
  },
  "9963P28": {
    code: "9963P28",
    title: "Horseback Riding on the Beach with Lunch",
    price: 360,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/12/55/45/63.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/5-hour-horseback-ride-on-the-beach-with-dinner/d538-9963P28",
    duration: "5 h"
  },
  "9963P16": {
    code: "9963P16",
    title: "Lisbon Monuments — Private Tour",
    price: 90,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/10/7d/4d/36.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Tour-Monuments-Half-Day/d538-9963P16",
    duration: "3 h"
  },
  "9963P27": {
    code: "9963P27",
    title: "Tile Painting Experience & Azeitão Winery Visit",
    price: 120,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0f/61/9f/11.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Tile-painting-experience-and-visit-to-Azeitao-cellars/d538-9963P27",
    duration: "4 h",
    rating: 5,
    reviews: 2
  },
  "9963P15": {
    code: "9963P15",
    title: "Lisbon Panoramic Viewpoints",
    price: 90,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/10/7d/4b/5a.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Lisbon-Panoramic-Half-day/d538-9963P15",
    duration: "2–3 h"
  },
  "9963P6": {
    code: "9963P6",
    title: "Horseback Riding — Beach, Mountain & Riding Arena",
    price: 130,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/06/f1/94/28.jpg",
    url: "https://www.viator.com/en-GB/tours/Almada/Horseback-Riding-Options-1-Horseback-ride-lesson-2-Horseback-ride-Arrabida-3-Horseback-ride-beach/d51024-9963P6",
    duration: "2 h",
    rating: 4.8,
    reviews: 36
  },
  "9963P21": {
    code: "9963P21",
    title: "Horseback Riding in Arrábida — Louro Mountain Trail",
    price: 260,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/06/e1/a2/4e.jpg",
    url: "https://www.viator.com/en-GB/tours/Setubal-District/HORSEBACK-RIDE-IN-ARRABIDA-LOURO-TRAIL-MOUNTAIN/d5016-9963P21",
    duration: "7 h",
    rating: 5,
    reviews: 24
  },
  "9963P31": {
    code: "9963P31",
    title: "Ride & Relax — Beach Escape in Costa da Caparica",
    price: 385,
    currency: "EUR",
    image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/17/04/95/d9.jpg",
    url: "https://www.viator.com/en-GB/tours/Lisbon/Ride-and-Relax-Beach-Escape-Lisbon-Costa-da-Caparica/d538-9963P31",
    duration: "8 h"
  }
};

export const currentViatorCodes = Object.keys(viatorListings);
export const viatorPriceCheckedAt = "23/09/2026";
