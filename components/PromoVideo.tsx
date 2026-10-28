import styles from "./PromoVideo.module.css";

type PromoVideoProps = {
  aiConciergeEnabled: boolean;
};

export default function PromoVideo({ aiConciergeEnabled }: PromoVideoProps) {
  return (
    <section className={styles.section} aria-labelledby="watermelon-app-film-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            <span className={styles.dot} aria-hidden="true" />
            MEET THE WATERMELON APP
          </p>
          <h2 id="watermelon-app-film-title">
            Your next adventure.
            <span>Portugal, your way.</span>
          </h2>
          <p className={styles.description}>
            Explore handpicked tours and experiences or let Watermelon AI help you
            discover a trip that matches your interests. See how easy it is to
            turn inspiration into your next experience in Portugal.
          </p>
          <div className={styles.highlights} aria-label="What Watermelon helps you do">
            <span>Explore curated tours</span>
            <span>Discover with AI</span>
            <span>Plan your own experience</span>
          </div>
          <div className={styles.actions}>
            <a
              className={styles.primary}
              href={aiConciergeEnabled ? "#ai-concierge" : "#experiencias"}
            >
              {aiConciergeEnabled ? "Plan your trip with AI" : "Explore experiences"}
              <span aria-hidden="true">↗</span>
            </a>
            <a className={styles.secondary} href="#experiencias">
              Browse our experiences
            </a>
          </div>
          <p className={styles.disclaimer}>
            31-second introduction · English narration · Sound is optional
          </p>
        </div>

        <div className={styles.mediaColumn}>
          <div className={styles.videoCard}>
            <div className={styles.videoTop}>
              <span>THE WATERMELON EXPERIENCE</span>
              <span className={styles.language}>EN · 0:31</span>
            </div>
            <video
              className={styles.video}
              controls
              preload="none"
              playsInline
              poster="/images/watermelon-app-video-poster.svg"
              aria-label="Watch the Watermelon Experiences app introduction in English"
            >
              <source
                src="/videos/watermelon-app-adventure-en.mp4"
                type="video/mp4"
              />
              Your browser does not support this video.
            </video>
          </div>
          <p className={styles.mediaCaption}>Press play to watch with sound.</p>
        </div>
      </div>
    </section>
  );
}
