# AI provider terms review

**Last verified: 22 October 2026.** This is not legal advice.

## How to read this document

Every statement is labelled with one of these:

| Label | Meaning |
|---|---|
| **Confirmed** | Stated in the provider's own published document, closely paraphrased, with the date and section shown on that document. |
| **Technical finding** | Established from EDplatform's code, tests or logs, or from provider documentation about how its systems behave. |
| **Inference** | Reasoned from confirmed facts, but not directly verified. |
| **Unverified** | Could not be confirmed from an official source. |
| **Interpretation** | How the terms might apply to EDplatform. This needs review by someone legally qualified. |

**How the sources were checked.**
- Web pages: each was downloaded and its text searched for the clauses below, rather than relying on summaries. Where OpenRouter publishes a Markdown version of a docs page, that version was used.
- Thinking Machines' terms: the two PDF documents were read in full.
- Dates: each date is the one printed on the document. A page "updated" date is reported separately from a terms "effective" date.

**No provider below is suitable for children's data on the current evidence.** Nothing here establishes that any route is safe for children's data. A route costing nothing does not make it suitable.

## 1. What EDplatform sends (technical finding)

- **Each tutor turn sends to OpenRouter:**
  - the assembled ED teaching prompt, which includes the student's first name and class level;
  - up to 12 previous messages from the conversation;
  - the new message;
  - the photo, on a photo turn.
- **Quiz analysis sends** the quiz title, the score, and each missed question with the student's answer, the correct answer and the stored explanation.
- **No other route sends student content to an AI service.**
  - The backend has exactly two outbound AI calls, both in `openrouter.provider.ts`: streaming, and structured quiz analysis.
  - The frontend makes no AI or audio API calls.
  - Read-aloud uses the browser's built-in `speechSynthesis` only, with play, pause, resume and stop, and makes no network requests.

| Route | Status |
|---|---|
| `google/gemma-4-31b-it:free` via OpenRouter | Live in production for text and photos. Google AI Studio is the only endpoint OpenRouter lists for this id. |
| `thinkingmachines/inkling-small:free` via OpenRouter | Evaluated as a fallback in PR #3 and rejected. The allowlist is empty, so it is never called. |

## 2. Summary by provider

| | OpenRouter (the platform in between) | Google AI Studio (serves Gemma) | Thinking Machines (rejected fallback) |
|---|---|---|---|
| Price for our use | Confirmed $0 for `:free` models | Confirmed: Gemma 4 is free tier only; the paid tier is "not available" | Confirmed $0 (the free research tier) |
| Free-tier limits | Confirmed: 20 per minute; 50 per day, or 1,000 per day after buying at least 10 credits | Applies to OpenRouter's Google account, not ours (inference) | Not stated |
| Retention | Confirmed: request metadata is logged; prompts and completions are not logged by default. The privacy policy keeps personal data "as long as reasonably necessary". | Confirmed: prompts are kept 55 days for abuse monitoring | Confirmed: "as long as reasonably necessary" |
| Training on content | Depends on the provider (confirmed) | Confirmed: unpaid-service content is used to improve Google's products | Confirmed: perpetual licence, including for training |
| Human review | Not stated for OpenRouter itself | Confirmed: human reviewers may read unpaid-service input and output; flagged content may be reviewed manually | Confirmed: automated or manual review allowed |
| Minors | Confirmed: users must be 18 or older | Confirmed under the Gemini API terms: users 18 or older; not to be used in apps directed at, or likely to be accessed by, under-18s. Which Google terms bind us is unresolved (5.1). | Confirmed: data from or about children under 13 must not be submitted; the service is not directed at under-13s |
| Suitable for children's data? | **Not established** | **Not established; unresolved concerns** | **No** (its own terms forbid it) |

## 3. Confirmed provider terms

### 3.1 OpenRouter

**Terms of Service** (openrouter.ai/terms, last updated 31 August 2026)
- **Section 2, Eligibility.** Users must be at least 18, and represent that they are.
- **Section 5.1, Applicability and Acceptance.**
  - By using a model, the customer agrees, and must make sure its users and customers agree, to that model's "Model Terms".
  - The customer alone must review those terms and decide whether they permit the intended use.
- **Section 5.2, Flow-Down to Authorized Users.** The customer must require its users and customers to follow the Model Terms, and is responsible for their acts, including breaches of Model Terms.
- **Section 5.5, Suspension and Termination.** The customer is solely responsible for Model Terms violations by itself, its users and its customers, and OpenRouter may suspend access over them.

**Privacy Policy** (openrouter.ai/privacy, last updated 31 August 2026)
- **Model providers.** Data practices differ between providers. Some may retain inputs and outputs and use them for training or improvement. OpenRouter tells users to review each provider's practices before using a model, and labels models that do not train where this has been disclosed to it.
- **Section 7, Personal Data Retention.** OpenRouter keeps information for as long as reasonably necessary for business, legal and compliance needs.
- **Section 8, Eligibility.** The site is for users aged 18 or older.
- **OpenRouter's own processing.** It describes disassociating inputs and outputs from user IDs for analytics such as its rankings, including assigning a topic category to each input. It also describes re-identifying a user ID with stored inputs for debugging.

**FAQ** (openrouter.ai/docs/faq, no date shown)
- OpenRouter logs basic request metadata: timestamps, model and token counts.
- Prompts and completions are not logged by default, even on errors, unless the account opts in.
- Providers that log, or whose policy OpenRouter could not confirm, are not routed to unless the training toggle in the account's privacy settings is on.
- Free models are limited to 50 requests per day in total, or 1,000 per day with at least 10 credits purchased.

**Limits** (openrouter.ai/docs/api-reference/limits, Markdown version, no date shown). For `:free` model variants:
- 20 requests per minute;
- 50 requests per day if fewer than 10 credits have ever been purchased;
- 1,000 requests per day with at least 10 credits.

**Provider logging** (openrouter.ai/docs/features/privacy-and-logging, no date shown)
- Each endpoint's provider data policy is reflected in structured data.
- Paid and free models have separate training opt-out settings. Opting out stops routing to providers that train.
- That setting does not change what OpenRouter itself does with prompts.

**Provider routing** (openrouter.ai/docs/features/provider-routing, no date shown)
- **`provider.max_price`:** the maximum price for a request. Unlike the performance preferences, it will prevent a request from running if the price is not available.
- **`provider.data_collection`:** `allow` (default) or `deny`. `deny` restricts a request to providers that do not store data.
- **`provider.zdr`:** restricts routing to zero-data-retention endpoints.
- **"Terms of Service" section:** users may not violate the terms or policies of the third-party providers that power the models.

### 3.2 Google: the Gemma route

**Gemini API Additional Terms of Service** (ai.google.dev/gemini-api/terms; effective 23 March 2026; page last updated 28 April 2026)
- **Scope.** They apply to the Gemini API, Google AI Studio and other Google developer services that reference them.
- **Age Requirements.** Users must be 18 or older. The services may not be used as part of a website, application or other service ("API Clients") that is directed towards, or likely to be accessed by, people under 18.
- **Use Restrictions.** For developers building for professional or business purposes, not consumer use.
- **Unpaid Services** (including Google AI Studio and unpaid Gemini API quota):
  - Google uses submitted content and generated responses to provide, improve and develop its products and machine-learning technologies;
  - human reviewers may read, annotate and process API input and output;
  - users must not submit sensitive, confidential or personal information.

**Pricing page** (ai.google.dev/gemini-api/docs/pricing). Gemma 4 is free of charge on the free tier, and its paid tier is "not available". "Used to improve our products" reads Yes for the free tier and No for the paid tier.

**Usage policies / abuse monitoring** (ai.google.dev/gemini-api/docs/usage-policies, page last updated 9 June 2026)
- Google keeps prompts and related data for 55 days to detect and prevent violations of its Prohibited Use Policy, and for required legal disclosures.
- Projects showing suspicious activity may be flagged for manual review by authorised Google staff.

**Gemma Terms of Use** (ai.google.dev/gemma/terms, last modified 1 April 2026). They say Gemma 4 has its own separate license. A keyword search found no age requirement.

**Gemma Prohibited Use Policy** (last modified 21 February 2024). It bans certain content, for example child sexual abuse material. It has no age requirement for users.

**Google Cloud Terms of Service** (cloud.google.com/terms, last modified 12 October 2026). This is the terms link in OpenRouter's public provider record for Google AI Studio. A keyword search found no age, minor or child clause.

### 3.3 Thinking Machines: the rejected fallback

Two PDFs, both "last updated 20 August 2026", read in full and linked from OpenRouter's provider record.

- **Terms of service, preamble.** The agreement may only be accepted by an adult of legal age of majority.
- **Terms of service, section 1(a).** Some models may be in beta and may not be suitable for commercial use.
- **Terms of service, section 1(c).** The company may monitor use and content, including by automated or manual review.
- **Terms of service, section 2.** The service is free, but fees, limits or discontinuation may follow with notice.
- **Terms of service, section 3(b).**
  - The customer grants a worldwide, irrevocable, perpetual licence to retain and use prompts and outputs, including to train models.
  - The customer must not submit personal data, or information it knows or should know is from or about children under 13 (or below the local age of online minority).
- **Privacy notice, section 3.** Prompts and outputs may be used to improve services, including by training and fine-tuning.
- **Privacy notice, section 5.** Data is kept for as long as reasonably necessary. No fixed period is given.
- **Privacy notice, section 8.** The service is not intended for or directed at children under 13.

## 4. Technical findings and inferences

- **Technical finding: pausing stops every external AI request.**
  - Chat, photo questions and quiz hints are refused before the session is read, before anything is stored, and before any request (tests in `verify_ai_pause.ts`).
  - Quiz analysis serves the local, non-AI version and writes nothing. A stored AI analysis is not served while paused.
- **Technical finding: the fallback allowlist is empty** (PR #3). No fallback model is created in any environment, and the evaluated model is refused before any network request.
- **Technical finding: the zero-price cap is untested.** Every fallback request would carry `provider.max_price = 0`, but it has not been tested live, and the docs do not say whether 0 is accepted.
- **Inference: this account probably allows training on free models.** OpenRouter's FAQ says providers that log or train are not used unless the account's training toggle is on. Gemma's only endpoint is Google's free tier, which uses content to improve products. Gemma requests do route (production logs, 22 October 2026). So the account's free-model training toggle is probably on. This was not checked in the account settings.
- **Inference: Google's limits apply to OpenRouter, not us.** Requests go through OpenRouter's Google account, so Google's own free-tier limits apply to OpenRouter's shared capacity. That matches the `upstream_rate_limited` failures seen in production.

## 5. Unresolved or unverified

1. **Which Google terms bind EDplatform through OpenRouter.**
   - The Gemini API terms cover Google AI Studio and contain the 18+ and under-18 clauses.
   - OpenRouter's provider record links the Google Cloud Terms instead, which contain no age clause.
   - OpenRouter's section 5.1 passes "Model Terms" through to us, but does not say which document that means for this provider.
2. **Whether a zero `max_price` means "free only".** Not documented, and not tested.
3. **The Gemma 4 license.** Not reviewed.
4. **This account's actual privacy settings.** Not inspected; see section 4.
5. **OpenRouter's handling of "stored inputs".** The privacy policy mentions stored inputs and topic categorisation, while the FAQ says prompts are not logged by default. When inputs are stored is not stated.

## 6. Interpretation (not legal advice; requires qualified review)

- **EDplatform is very likely "directed towards" under-18s.** It is built for Class 6 to 8 students. If the Gemini API Additional Terms apply (5.1), the live Gemma route conflicts with them.
- **Children's personal data reaches services that train on it.** Each turn sends a child's message and first name. On the free tiers in use, content may be retained, reviewed by people and used for training. Google also tells users not to send personal information to unpaid services.
- **OpenRouter's terms make EDplatform responsible.** Section 5.1 puts it on EDplatform to confirm that each model's terms permit this use. Its own eligibility clause requires users to be 18 or older; how that applies when an adult operator serves child end-users is a legal question.
- **The evaluated fallback breaches its own terms.** Thinking Machines' terms forbid sending information from or about children under 13. Using it would breach them.
- **Children's data law may apply as well.** Laws where the students live (for example India's Digital Personal Data Protection Act, if it applies) may require things such as verifiable parental consent. Not researched here.

## 7. Recommended next steps (safest first)

1. **Pause external AI now.** Merge PR #4 and deploy, then set `AI_TUTOR_MODE=paused`. This stops children's data going to free-tier services while the questions above are open. It costs nothing, adds no service, and is undone by removing the variable. Lessons, quizzes, the local quiz analysis and read-aloud keep working.
2. **Check the account settings without changing them.** In OpenRouter's privacy settings, see whether training and logging are allowed for free models.
3. **Get a qualified review** of sections 5 and 6, including the applicable children's data law, before resuming AI tutoring for students.
4. **Keep the fallback allowlist empty** until a model's pricing, terms, privacy practices and suitability for children's data are all verified. A $0 price is not enough.

## 8. Sources

| Document | Date on the document | Location |
|---|---|---|
| OpenRouter Terms of Service | Last updated 31 Aug 2026 | https://openrouter.ai/terms |
| OpenRouter Privacy Policy | Last updated 31 Aug 2026 | https://openrouter.ai/privacy |
| OpenRouter FAQ | No date shown | https://openrouter.ai/docs/faq.md |
| OpenRouter limits | No date shown | https://openrouter.ai/docs/api-reference/limits.md |
| OpenRouter provider logging | No date shown | https://openrouter.ai/docs/features/privacy-and-logging.md |
| OpenRouter provider routing | No date shown | https://openrouter.ai/docs/features/provider-routing |
| OpenRouter provider list (links each provider's terms) | Live API | https://openrouter.ai/api/v1/providers |
| Gemini API Additional Terms of Service | Effective 23 Mar 2026; page updated 28 Apr 2026 | https://ai.google.dev/gemini-api/terms |
| Gemini API pricing | Not recorded | https://ai.google.dev/gemini-api/docs/pricing |
| Gemini API usage policies (abuse monitoring) | Page updated 9 Jun 2026 | https://ai.google.dev/gemini-api/docs/usage-policies |
| Gemma Terms of Use | Last modified 1 Apr 2026 | https://ai.google.dev/gemma/terms |
| Gemma Prohibited Use Policy | Last modified 21 Feb 2024 | https://ai.google.dev/gemma/prohibited_use_policy |
| Google Cloud Terms of Service | Last modified 12 Oct 2026 | https://cloud.google.com/terms/ |
| Thinking Machines Free Research API Tier privacy notice | Last updated 20 Aug 2026 | https://thinkingmachines.ai/legal/tml-free-research-api-tier-privacy-notice.pdf |
| Thinking Machines Free Research API Tier terms of service | Last updated 20 Aug 2026 | https://thinkingmachines.ai/legal/tml-free-research-api-tier-terms-of-service.pdf |
