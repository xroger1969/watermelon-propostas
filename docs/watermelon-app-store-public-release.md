# Watermelon Experiences — public App Store release 1.0

This is a preparation record, NOT evidence that the App Store Connect fields have been saved or that the Apple public App Review has been submitted.

## Distribution settings to enter in App Store Connect

- Apple app record: `6821932993`
- App Store version: `1.0` (matching iOS target `MARKETING_VERSION = 1.0`)
- Price: **Free / 0 €**, with **no in-app subscription or in-app purchase** required for app functionality.
- Distribution method: Public (not private/custom). Make available in the appropriate storefronts, ideally worldwide for international tourists.
- App category: Travel.
- Version release after approval: automatic if all operations and screenshots are confirmed; otherwise manual release.
- Nature of business: **the app is free, but its core purpose is selling Watermelon Experiences' own paid, real-world tours and activities created in Watermelon Product Studio**. Free app use must not be confused with free tour services. Real-world tourism services use payments outside Apple's in-app purchases under App Review Guideline 3.1.3(e).
- Support URL: https://www.watermelonexperiences.pt/support
- Privacy policy URL: https://www.watermelonexperiences.pt/privacy
- Support/review contact: info@watermelonexperiences.pt

**Verify all of these settings in App Store Connect; none are changed by this Markdown document.**

## Suggested English (US) metadata, for review before copying

**Name:** Watermelon Experiences

**Subtitle:** Explore Portugal with AI

**Promotional text:** Discover experiences across Portugal, plan with Watermelon AI and request personalised travel proposals.

**Description:**

Discover Portugal with Watermelon Experiences, your travel companion for exploring memorable local activities.

Browse experiences including private tours, coastal adventures, culture, and food. Explore photographs, descriptions, itineraries, and available prices.

Ask Watermelon AI to help shape travel ideas and personalised plans, save experiences that interest you, and request proposals or reservations with our team.

Use My Trips to keep relevant travel information together and make planning your next experience easier.

The app is free to download and use. Tours and experiences are separate services, with prices and availability subject to confirmation.

**Keywords:** Portugal,tours,Lisbon,Arrabida,Setubal,experiences,travel,activities,private,planner

**What's New (first public version):** Welcome to Watermelon Experiences! Discover tours, plan with Watermelon AI and request personalised proposals.

## Public App Review notes (suggested)

This is a free app for discovering and planning tourism experiences in Portugal. Guests may browse the experience catalogue and interact with the AI travel assistant without signing in. Guests can request proposals and reservations for real-world services. Such services may have separately quoted prices and are not digital in-app purchases.

Please test catalogue browsing, AI planning, favourites, requests for proposals or reservations, My Trips and the speech-to-text permission flow. If the review requires a test booking, please identify it as a test and avoid taking real payment.

Contact: info@watermelonexperiences.pt.

## Commercial requirements — first-party products and bookings

**Business goal:** convert tourists who discover Watermelon Experiences' own published Product Studio catalogue into confirmed, paid direct bookings, tracked in Watermelon CRM. Viator/GetYourGuide may remain secondary channels; Watermelon Direct must preserve its own product codes, option prices, group/per-person pricing, published status, operational availability, and booking/payment references.

**Current implementation (verified from source on 24 October 2026):**
- The native iOS catalogue reads `/api/watermelon-catalog` first-party Studio products and also merges a Viator catalogue by product code; the Studio's data overrides duplicates.
- A customer can choose an option/date/guest count and submit a booking request through `/api/booking-request`, producing a CRM row with `status=pending` and `payment_status=not_requested`. A request is not itself a paid or confirmed sale.
- Received, shareable proposals can be accepted in the native app and may link to an existing secure website payment page when a valid payment token is present.
- **Direct instant checkout from a programme card is not yet verified/implemented.** Do not describe the product as having one-step in-app purchase before an end-to-end test confirms it.

**Required sales journey:**
1. Publish Watermelon-owned experiences with images, schedules, prices, options, terms, capacity and current availability in Product Studio, then display only eligible published products for direct sale in the iOS catalogue.
2. Customer selects programme, date, time, guests; server validates an up-to-date quote and avoids overbooking.
3. If the programme is available for instant booking, offer secure card or Apple Pay checkout through a tourism-appropriate payment processor; otherwise send a reservation request for manual availability confirmation and issue a payment link only when confirmed.
4. Verify payment server-side via trusted provider status/webhook; update CRM booking and payment state atomically/idempotently. Do not mark paid on an unverified frontend redirect.
5. Provide an explicit confirmation/reference to the customer and show it in My Trips; handle cancellation and refund policies.
6. Test duplicate requests, failed or abandoned payment, sold-out slots, price changes, timezone, promotions and refund flows before advertising this as an instant purchase.

This feature goal does not imply all steps are already deployed. Any future checkout implementation should reuse audited server/payment services and must not expose processor secrets in iOS code.

## Final release gate — must verify in Apple

- [ ] App Store Connect currently shows iOS version **1.0** and offers a **1.0** build for selection.
- [ ] The new iOS 1.0 build has passed Xcode native tests, signed, uploaded and completed Apple processing.
- [ ] Set and verify **Free** pricing / 0 € and **Public** distribution in App Store Connect.
- [ ] Complete Age Rating with accurate questionnaire answers and Content Rights based on actual assets/Viator and partner images.
- [ ] Choose primary category (Travel) and submit copyright/rights details as appropriate.
- [ ] Supply genuine iPhone screenshots. Because the native project targets both iPhone and iPad, provide iPad screenshots too if Apple requires them.
- [ ] Complete all English (US) mandatory fields, support URL, privacy-policy URL, and review contact.
- [ ] Complete the App Privacy questionnaire truthfully. Starting point for audit: `PrivacyInfo.xcprivacy` declares name, email, phone, and other user content as linked to the user for app functionality, without tracking. Check server-side AI processing, analytics, reservation/payment processing, retention and vendors for any additional required disclosures.
- [ ] Check App Accessibility questions, export-compliance/encryption and trader status in the EU where applicable.
- [ ] Check and document the customer sales flow for first-party Product Studio tours: booking request, manual confirmation/payment link, or completed real-time checkout as actually implemented. Ensure listing language matches what the build does.
- [ ] Confirm public App Store Review submission was actually accepted. External TestFlight review is not equivalent.
- [ ] Do not claim App Store approval or publish availability until verified in App Store Connect.

## Technical notes

Apple associates uploaded binaries to versions by the bundle's marketing version. Older TestFlight builds (0.2.0) should not be selected for the App Store's version 1.0 record.

The GitHub workflow `.github/workflows/watermelon-ios.yml` builds, tests and (when explicitly triggered) uploads new iOS binaries. The script `scripts/watermelon-sign-export.sh` sets the build number based on the GitHub workflow run number.

No app price, App Store listing field, or screenshot is written to Apple's systems by the repository version change alone.
