# Watermelon Studio — GetYourGuide dual integration

Status: **prepared for onboarding; no GetYourGuide API credentials or external connection verified**.

## 1. Supplier / Connectivity
- The Watermelon Product Studio is the source of truth for the operator's own tours.
- Prepare submission packages in the existing GetYourGuide Publisher; submit and manage approval in Supplier Portal.
- Direct Supplier Connectivity is a **separate** process, subject to GetYourGuide eligibility, technical certification and documented endpoint contracts. Only implement endpoints after receiving current official contract/documentation.
- Future server-side capabilities: product/option identifier mapping; read availability/prices; reserve/confirm/cancel; notification processing; deduplication and retries. Never confirm a booking without supplier acknowledgment.
- The Studio now requires an actual official GetYourGuide product ID, public HTTPS GetYourGuide listing URL and explicit operator confirmation before marking a programme “Published”.

## 2. Partner API / Affiliate
- Request independent commercial permission for authorised discovery and referrals from the Watermelon website's AI concierge.
- If API access is not granted, use only contractually permitted partner deep-links/widgets.
- Do not scrape, copy images/descriptions without licence, or invent availability/prices. Attribute source clearly.
- All credentials and commission/attribution parameters are server-side; do not put tokens in browser code or in source control.

## Environment contract
These names are reserved; **none should be populated without the corresponding approval**.
All booleans require literal value `true`.

| Variable | Purpose |
| --- | --- |
| `GYG_SUPPLIER_APPROVED` | Explicit supplier connectivity approval recorded |
| `GYG_SUPPLIER_BASIC_USER` and `GYG_SUPPLIER_BASIC_PASSWORD` | Reserved for server-side inbound connectivity authentication, only if official specs require Basic auth |
| `GYG_SUPPLIER_CONNECTIVITY_CERTIFIED` | Actual certification completed |
| `GYG_SUPPLIER_ENABLED` | Operator intent to enable (does not itself activate endpoints) |
| `GYG_PARTNER_APPROVED` | Commercial partner access approved |
| `GYG_PARTNER_MODE` | `affiliate`, `api` or unset |
| `GYG_AFFILIATE_PARTNER_ID` | Authorised partner identifier |
| `GYG_PARTNER_API_KEY` | Server-side access token/key when API authorised |
| `GYG_PARTNER_ENABLED` | Operator intent to enable (does not itself make calls) |

`/api/getyourguide-readiness` is **read-only**, includes only booleans, has no-store caching and never returns sensitive environment values.
Its `externalConnectionValidated` fields intentionally remain `false` until a **real, independently tested** connection is implemented.

## Activation checklist
1. Complete supplier identity verification in the GetYourGuide portal.
2. Obtain official written connectivity requirements, sandbox and approval; confirm whether direct in-house systems are supported.
3. Establish supported authentication, endpoint schema, idempotency, rate limits, booking/notification failure handling and monitoring.
4. Test full lifecycle with GetYourGuide and obtain certification before production reservations.
5. Obtain separate Partner/API or affiliate approval, permitted catalogues and click attribution requirements.
6. Only then connect approved public suggestions into the Watermelon website's AI concierge, with verified referral links and compliance disclosures.

## Scope of this change
No migrations, existing product updates, external API calls, automatic publications, customer bookings or changes to the production Watermelon website. These edits are scoped to `product-studio/`.
