# AI provider terms review

**Last verified: 22 October 2026.** This is not legal advice.

The document has four parts:
- **Confirmed** (section 1): what each provider's published document says, closely paraphrased, with where it says it.
- **Conflicting or unverified** (section 2): points where the sources disagree, or could not be checked.
- **Interpretation** (section 3): how those terms might apply to EDplatform. This needs review by someone qualified before anyone relies on it.
- **Actions and sources** (sections 4 and 5).

**How this was checked.**
- Web pages: each was downloaded and its text searched for the clauses below, rather than relying on summaries.
- Thinking Machines' terms: the two PDF documents were read in full.
- Dates: each date is the one printed on that document. Where a page shows both an "effective" date and a "last updated" date, both are given.

## Context

ED serves students in Classes 6 to 8, roughly ages 11 to 14. Every tutor turn sends the student's messages and the assembled teaching prompt, which includes the student's first name and class level. A photo turn also sends the photo.

| Route | Status | Who receives student content |
|---|---|---|
| `google/gemma-4-31b-it:free` via OpenRouter | Live in production (text and photos) | OpenRouter, then Google AI Studio (the only endpoint OpenRouter lists for this id) |
| `thinkingmachines/inkling-small:free` via OpenRouter | Proposed fallback in PR #3. Not merged; allowlist empty, so never called | OpenRouter, then Thinking Machines |

## 1. Confirmed

### Google: Gemini API Additional Terms of Service

ai.google.dev/gemini-api/terms. The page says the terms are effective 23 March 2026, and the page itself was last updated 28 April 2026.

- **Scope.** The opening paragraph says these terms apply to the Gemini API, Google AI Studio and other Google developer services that reference them.
- **Age Requirements.** Users must be 18 or older to use the APIs.
- **Age Requirements (continued).** The services may not be used as part of a website, application or other service ("API Clients") that is directed towards, or likely to be accessed by, people under 18.
- **Use Restrictions.** Google AI Studio and the Gemini API are for developers building for professional or business purposes, not for consumer use.
- **Unpaid Services.** Free use, including unpaid quota on the Gemini API and direct use of Google AI Studio, counts as "Unpaid Services".
- **How Google uses your data (unpaid services).**
  - Google uses submitted content and generated responses to provide, improve and develop its products and machine-learning technologies.
  - Human reviewers may read, annotate and process API input and output.
  - Users are told not to submit sensitive, confidential or personal information to unpaid services.

### Google: Gemini API pricing page

ai.google.dev/gemini-api/docs/pricing.

- **Gemma 4 pricing.** Gemma 4 is free of charge on the free tier, and the paid tier is listed as not available.
- **Data use.** The row "used to improve our products" reads Yes for the free tier and No for the paid tier.

### Google: Gemma terms

- **Gemma Terms of Use** (ai.google.dev/gemma/terms, last modified 1 April 2026). The page says Gemma 4 is covered by a separate Gemma 4 license. A keyword search of this page found no age or minor requirement.
- **Gemma Prohibited Use Policy** (last modified 21 February 2024). It bans certain content, for example child sexual abuse material. It contains no age requirement for users.

### Google Cloud Terms of Service

cloud.google.com/terms, last modified 12 October 2026. This is the document OpenRouter's public provider record links as the Google AI Studio provider's terms of service (see 2.1). A keyword search found no age, minor or child clause.

### OpenRouter: Terms of Service

openrouter.ai/terms, last updated 31 August 2026.

- **Section 2, Eligibility.** Users must be at least 18 to use the service, and represent that they are.
- **Section 5.1, Applicability and Acceptance.**
  - By using a model, the customer agrees, and must make sure its users and customers agree, to comply with that model's "Model Terms".
  - The customer alone is responsible for reviewing those terms and for deciding whether they allow the intended use.
- **Section 5.2, Flow-Down to Authorized Users.**
  - The customer must require its users and customers to use the service and models only in line with these terms and the Model Terms.
  - The customer is responsible for its users' acts, including breaches of Model Terms.
- **Section 5.5, Suspension and Termination.**
  - The customer is solely responsible for violations of Model Terms by itself, its users and its customers.
  - OpenRouter may suspend access over such violations.
- **Provider routing page, "Terms of Service" section.** Users may not violate the terms or policies of the third-party providers that power the models.

### OpenRouter: privacy and logging documentation

openrouter.ai/docs/features/privacy-and-logging. The page shows no date.

- **Data policies per endpoint.** Each provider's data handling policy is reflected in structured data on each endpoint.
- **Training opt-out.**
  - An account setting controls whether requests may be routed to providers that may train on data.
  - Paid and free models have separate settings.
  - Opting out stops routing to providers that train.
  - OpenRouter says it works with providers to prevent training on prompts where possible, but that there are exceptions.
- **OpenRouter's own handling.** The training setting has no bearing on what OpenRouter itself does with prompts. This page does not describe OpenRouter's own retention.

### OpenRouter: provider routing documentation

openrouter.ai/docs/features/provider-routing. The page shows no date.

- **`provider.max_price`** is described as the maximum pricing you want to pay for a request. Unlike the performance preferences, it will prevent a request from running if the price is not available.
- **`provider.data_collection`** takes `allow` (the default) or `deny`. `deny` restricts a request to providers that do not store data.
- **`provider.zdr`** restricts routing to zero-data-retention endpoints.

### Thinking Machines: Free Research API Tier

Two PDFs, both "last updated 20 August 2026" and read in full. OpenRouter's public provider record links both for this provider.

- **Terms of service, preamble.** The agreement may only be accepted by an adult of legal age of majority.
- **Terms of service, section 1(a).** Some models may be offered in beta and may not be suitable for commercial use.
- **Terms of service, section 1(c).** The company may monitor use and content, including by automated or manual review.
- **Terms of service, section 2.** The service is free, but fees, limits or discontinuation may follow with notice.
- **Terms of service, section 3(b).**
  - The customer grants a worldwide, irrevocable, perpetual licence to retain and use prompts and outputs, including to train models, during and after the agreement.
  - The customer must not submit any personal data, or information it knows or should know is from or about children under 13 (or below the local age of online minority).
- **Privacy notice, section 3.** Prompts and outputs may be used to improve services, including by training and fine-tuning.
- **Privacy notice, section 5.** Personal information is kept for as long as reasonably necessary. No fixed period is given.
- **Privacy notice, section 8.** The services are not intended for or directed at children under 13.

## 2. Conflicting or unverified

### 2.1 Which Google terms apply to Gemma reached through OpenRouter: unresolved

- **The Gemini API terms** say they govern Google AI Studio and the Gemini API. They contain the 18+ rule and the ban on use in services aimed at under-18s.
- **OpenRouter's provider record** for Google AI Studio links the Google Cloud Terms of Service instead. That document contains no age clause.
- **The connection is indirect.** EDplatform does not hold a Google account for this route; OpenRouter does.
- **Conclusion.** It is not confirmed which Google terms bind EDplatform here, or whether the 18+ and under-18 clauses reach EDplatform through OpenRouter's section 5. This document does not claim that they do.

### 2.2 Free-model rate limits: not verified

OpenRouter's limits page loads the numbers in its free-model table with JavaScript, so they are not in the published page text. An earlier automated summary reported 20 requests per minute and 50 per day. Those figures are **not verified** and should not be relied on.

### 2.3 Whether a zero `max_price` means "free only": not documented

The docs do not say whether 0 is accepted, or what error is returned. This was not tested live, because a meaningful test needs a paid model.

### 2.4 OpenRouter's own retention of prompts: not reviewed

The privacy and logging page says OpenRouter's own handling is separate from the training setting, but does not describe it. OpenRouter's separate privacy policy was not reviewed.

### 2.5 Gemma 4 license: not reviewed

The Gemma Terms of Use page says Gemma 4 has its own license. That license was not read for this review.

### 2.6 Effect of the free-model training opt-out on Gemma: not tested

Turning on OpenRouter's training opt-out for free models might exclude Google AI Studio's free endpoint, which is Gemma's only route.

## 3. Interpretation (not legal advice)

- **EDplatform is probably "directed towards" under-18s.** It is built for Class 6 to 8 students. If the Gemini API Additional Terms apply (see 2.1), the live Gemma route would conflict with their 18+ and under-18 clauses.
- **Each turn sends a child's personal data.** The student's message and first name go out on every turn. Google's terms on unpaid services, and Thinking Machines' terms, both allow content to be retained, read by people and used for training. Google's terms also tell users not to send personal information to unpaid services.
- **The evaluated fallback breaches its own terms.** Thinking Machines' terms expressly forbid submitting information from or about children under 13, and some students are under 13. This is why PR #3's allowlist is empty.
- **OpenRouter's terms put the burden on EDplatform.** Section 5.1 makes EDplatform responsible for checking that each model's terms permit this use. Section 5.5 allows suspension over violations.
- **Children's data law may also apply.** Laws where the students live (for example India's Digital Personal Data Protection Act, if it applies) may impose separate requirements such as parental consent. This was not researched for this review.

## 4. Actions taken

- **Diagnostics (merged, deployed).** PR #2 added safe provider-failure diagnostics. The live outage was traced to `reason=upstream_rate_limited` from Google AI Studio.
- **Fallback (PR #3, not merged).**
  - The fallback-model allowlist is empty, so no fallback model can be called.
  - The lesson-text fallback is never shown while the student has a quiz in progress, or when that cannot be checked.
- **Pause switch (PR #4, not merged or deployed).** `AI_TUTOR_MODE=paused` stops every external AI request:
  - chat, photo questions and quiz hints are refused before anything is stored or sent;
  - quiz analysis serves the local, non-AI version and writes nothing.

  Gemma's configuration, the API key and the teaching prompt are unchanged.

## 5. Sources

| Document | Date shown on the document | Location |
|---|---|---|
| Gemini API Additional Terms of Service | Effective 23 Mar 2026; page updated 28 Apr 2026 | https://ai.google.dev/gemini-api/terms |
| Gemini API pricing | (page date not recorded) | https://ai.google.dev/gemini-api/docs/pricing |
| Gemma Terms of Use | Last modified 1 Apr 2026 | https://ai.google.dev/gemma/terms |
| Gemma Prohibited Use Policy | Last modified 21 Feb 2024 | https://ai.google.dev/gemma/prohibited_use_policy |
| Google Cloud Terms of Service | Last modified 12 Oct 2026 | https://cloud.google.com/terms/ |
| OpenRouter Terms of Service | Last updated 31 Aug 2026 | https://openrouter.ai/terms |
| OpenRouter privacy and logging | No date shown | https://openrouter.ai/docs/features/privacy-and-logging |
| OpenRouter provider routing | No date shown | https://openrouter.ai/docs/features/provider-routing |
| OpenRouter limits | No date shown; figures not rendered | https://openrouter.ai/docs/api-reference/limits |
| OpenRouter provider list (links each provider's terms) | Live API | https://openrouter.ai/api/v1/providers |
| Thinking Machines Free Research API Tier privacy notice | Last updated 20 Aug 2026 | https://thinkingmachines.ai/legal/tml-free-research-api-tier-privacy-notice.pdf |
| Thinking Machines Free Research API Tier terms of service | Last updated 20 Aug 2026 | https://thinkingmachines.ai/legal/tml-free-research-api-tier-terms-of-service.pdf |
