# AI provider terms review

Reviewed 22 October 2026, while diagnosing the live AI tutor outage and reviewing a proposed free fallback model.

**This is not legal advice.** It records what each provider's documents say, separately from how they might apply to EDplatform. The interpretation needs review by someone qualified before anyone relies on it.

EDplatform's tutor (ED) serves students in Classes 6 to 8, roughly ages 11 to 14. Every tutor turn sends the assembled teaching prompt, which includes the student's first name and class level, plus their recent messages and the new message. A photo turn also sends the photo.

## Routes in scope

| Route | Status | Upstream that receives student content |
|---|---|---|
| `google/gemma-4-31b-it:free` via OpenRouter | Live in production (text and photos) | Google AI Studio, OpenRouter's only endpoint for this id |
| `thinkingmachines/inkling-small:free` via OpenRouter | Proposed fallback in PR #3. Not merged; its allowlist is now empty | Thinking Machines |

## 1. Confirmed terms

These are paraphrased from the providers' own published documents, read on 22 October 2026. Each provider can change its terms, so re-check the source before relying on any of it.

### Google: Gemini API Additional Terms of Service

These govern the Google AI Studio API that serves the Gemma route. The page showed "last updated 28 April 2026".

- Users must be 18 or older to use the APIs.
- The APIs may not be used in an application that is directed towards, or likely to be accessed by, people under 18.
- For unpaid services, Google uses submitted content and generated responses to improve its products and machine-learning technologies.
- For unpaid services, human reviewers may read, annotate and process API input and output.
- Users are told not to submit sensitive, confidential or personal information to unpaid services.

Google's pricing page lists Gemma 4 as free tier only (the paid tier is "not available"). It marks free-tier usage as used to improve Google's products.

### OpenRouter: Terms of Service and privacy documentation

The terms page showed "Last Updated: August 31, 2026".

- Section 2: users must be at least 18.
- Section 5.1: the customer must comply with, and ensure its users and customers comply with, the terms of each model it uses.
- Section 5.2: the customer is responsible for its users' acts, including breaches of model terms.

The privacy and logging documentation says:

- each endpoint's provider data policy is reflected in structured data;
- free and paid models have separate training opt-out settings;
- an account-wide opt-out stops routing to providers that train.

The provider-routing documentation describes two request options:

- `provider.max_price`, a price ceiling that prevents a request from running if the price is not available;
- `provider.data_collection: "deny"`, which restricts a request to providers that do not collect user data.

Free-model limits: 20 requests per minute, and 50 per day for accounts below the credit-purchase threshold.

### Thinking Machines: Free Research API Tier

These are the privacy notice and terms of service that OpenRouter links for this provider. Both are dated 20 August 2026.

- **Training:** prompts and outputs may be used to improve services, including training and fine-tuning. The customer grants a worldwide, irrevocable, perpetual licence to retain and use content for this, during and after the agreement.
- **Retention:** personal information is kept for as long as reasonably necessary. No fixed period is given.
- **Review:** the company may monitor use and content through automated or manual review.
- **Children:** customers must not submit personal data, or information from or about children under 13 (or below the local age of online minority). The service is not intended for or directed at children under 13.
- **Commercial use:** some models may be in beta and may not be suitable for commercial use.
- **Changes:** the free service may begin charging, change limits or be discontinued, with notice.

## 2. Interpretation (not legal advice)

- **EDplatform is probably "directed towards" under-18s.** It is built for Class 6 to 8 students. Taken at face value, Google's restriction would then cover the live Gemma route. OpenRouter's section 5.1 would carry that obligation to EDplatform as OpenRouter's customer.
- **Students' personal data reaches free tiers that may train on it and let people read it.** Each turn sends a child's message and first name. On both routes, the published terms allow the content to be retained, reviewed by people and used for training.
- **The proposed fallback conflicts with its own terms.** Thinking Machines' terms expressly prohibit submitting information from or about children under 13, and some Class 6 to 8 students are under 13. This is why PR #3 was not merged and its fallback allowlist was emptied.
- **Children's data law may apply as well.** Laws where the students live (for example India's Digital Personal Data Protection Act, if it applies) may impose separate requirements such as parental consent. This was not researched for this review.

## 3. Unknown or unverified

- **How Google's terms apply through OpenRouter.** When Gemma is reached through OpenRouter's own Google account rather than EDplatform's, it is unclear how Google's terms apply to EDplatform. OpenRouter's section 5.1 suggests they pass through, but the exact effect is a legal question.
- **Whether OpenRouter itself keeps prompts.** The privacy page that was read did not say.
- **Whether the training opt-out would block Gemma.** Turning on OpenRouter's training opt-out for free models might exclude Google AI Studio's free Gemma endpoint, and with it the only route Gemma has. Not tested.
- **Whether a zero `max_price` is honoured as "free only".** The documentation does not say whether a value of 0 is accepted, or what error comes back. It was not tested live, because a meaningful test would need a paid model.

## 4. Actions taken and available controls

- **Diagnostics (merged and deployed).** PR #2 added safe diagnostics for provider failures. The live outage was traced to `reason=upstream_rate_limited` from Google AI Studio.
- **Fallback held back.** PR #3 (free fallback model plus a lesson-text fallback) is not merged. Its fallback-model allowlist is empty, so no fallback model can be called, and its lesson fallback will not show lesson text while the student has a quiz in progress.
- **Pause switch (code ready, not deployed).** `AI_TUTOR_MODE=paused` stops every external AI request:
  - tutor chat, photo questions and quiz hints are refused before anything is stored or sent;
  - quiz analysis uses the local, non-AI version.

  The Gemma configuration, the API key and the teaching prompt are left unchanged. Removing the variable restores normal operation.

## 5. Sources

| Document | Location |
|---|---|
| Gemini API Additional Terms of Service | https://ai.google.dev/gemini-api/terms |
| Gemini API pricing | https://ai.google.dev/gemini-api/docs/pricing |
| OpenRouter Terms of Service | https://openrouter.ai/terms |
| OpenRouter privacy and logging | https://openrouter.ai/docs/features/privacy-and-logging |
| OpenRouter provider routing | https://openrouter.ai/docs/features/provider-routing |
| OpenRouter limits | https://openrouter.ai/docs/api-reference/limits |
| OpenRouter provider list (links each provider's terms) | https://openrouter.ai/api/v1/providers |
| Thinking Machines Free Research API Tier privacy notice | https://thinkingmachines.ai/legal/tml-free-research-api-tier-privacy-notice.pdf |
| Thinking Machines Free Research API Tier terms of service | https://thinkingmachines.ai/legal/tml-free-research-api-tier-terms-of-service.pdf |
