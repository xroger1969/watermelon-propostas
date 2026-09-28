import styles from "./GuestReviews.module.css";

// Curated excerpts checked on 2026-09-28. These are not a live review feed.
// Keep the original wording, public author and written date when updating.
// Do not combine listing scores/counts: the two listings may overlap.
const reviews = [
  {
    author: "Go287230",
    experience: "Tile painting & wine tasting",
    quote: "Our tile and wine tasting was fantastic! Carlos was so informative and knowledgeable.",
    date: "2025-10-21",
    dateLabel: "21 October 2025",
    source: "https://www.tripadvisor.com/AttractionProductReview-g1022768-d11476368-Horseback_Riding_4_Options_Mountain_Lesson_Ring_Beach_2Hours-Almada_Setubal_Distr.html",
  },
  {
    author: "Lucy",
    experience: "Tile painting & wine tasting",
    quote: "Carlos was a very gracious and engaging host!",
    date: "2023-09-24",
    dateLabel: "24 September 2023",
    source: "https://www.tripadvisor.com/AttractionProductReview-g189158-d24808551-Tile_painting_experience_and_visit_Azeitao_wine_cellar-Lisbon_Lisbon_District_Cent.html",
  },
  {
    author: "Steven M",
    experience: "Private tour of Almada",
    quote: "This 1/2 day tour to Almada with Watermelon Experiences was simply superb.",
    date: "2019-04-29",
    dateLabel: "29 April 2019",
    source: "https://www.tripadvisor.com/AttractionProductReview-g1022768-d12649606-South_of_Lisbon_Private_Tour_Cacilhas_Almada_Costa_da_Caparica-Almada_Setubal_Dis.html",
  },
];

export default function GuestReviews() {
  return (
    <section className={styles.section} id="guest-reviews" aria-labelledby="guest-reviews-title">
      <div className={styles.inner}>
        <p className="eyebrow dark">GUEST STORIES</p>
        <h2 id="guest-reviews-title">What our guests say</h2>
        <p className={styles.intro}>A few words from guests who explored Portugal with us.</p>

        <div className={styles.grid}>
          {reviews.map((review) => (
            <figure className={styles.card} key={review.author}>
              <p className={styles.experience}>{review.experience}</p>
              <blockquote cite={review.source}>
                <p>“{review.quote}”</p>
              </blockquote>
              <figcaption>
                <strong>{review.author}</strong>
                <time dateTime={review.date}>{review.dateLabel}</time>
                <a href={review.source} target="_blank" rel="noopener noreferrer"
                  aria-label={`Read ${review.author}'s review on Tripadvisor (opens in a new tab)`}>
                  Tripadvisor · Read review <span aria-hidden="true">↗</span>
                </a>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className={styles.note}>Selected excerpts from Tripadvisor guest reviews. Source links open in a new tab.</p>
      </div>
    </section>
  );
}
