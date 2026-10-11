# Curriculum Architecture — Design Proposal

**Status:** proposal for review. Nothing in this document has been implemented.
**Scope:** how EDplatform should represent real CBSE Class 6–8 curriculum for Mathematics, Science, Social Science and English.
**Constraint honoured while writing:** no schema change, no migration, no database access, no seed data, no Git change.

**Guiding principle:** ED is the product. The curriculum is structured knowledge *underneath* ED — it exists to give the tutor grounding and the student a path, not to make EDplatform an LMS again.

---

## A. Current architecture

| Layer | What exists today |
|---|---|
| Hierarchy | `Course → Module → Lesson`, plus `Resource` per lesson |
| Class/subject model | `ClassLevel` (`CLASS_6/7/8`), `Board` (`CBSE`), `SubjectKey` (`MATH`, `SCIENCE`, `SOCIAL_SCIENCE`, `ENGLISH`) — all enums, on `StudentProfile` / `StudentSubject` |
| Class filtering | `CLASS_COURSE_SLUGS` allowlist + `isCourseVisibleToClass()` in `packages/shared/src/constants/curriculum.ts`. Currently empty for all three classes, so no course is visible to any student |
| Catalogue API | `GET /api/v1/courses` → `optionalAuthenticate` → class level read from the student's stored profile → slug allowlist filter → `[]` when class is unknown |
| Tutor | `TutorSession` (nullable `lessonId`, snapshotted `classLevel`, `subject`) + `TutorMessage`; SSE streaming; layered prompt |
| Prompt layers | safety → ED voice → class profile → subject → preferences → turn action |
| Progress | `LessonProgress` per `(userId, lessonId)` with `isCompleted`, `coveragePercentage`, `watchedIntervalsJson` |
| Quiz | `Quiz` with **nullable** `moduleId` *and* `lessonId`; `QuizQuestion` → `QuizOption`; server-authoritative grading |
| Learn frontend | `/learn` (class-aware subject tiles) → `/learn/[subject]` |
| Legacy data | 7 software-engineering courses, 9 modules, 17 lessons, 10 enrollments. Retained deliberately |

### Files inspected

`apps/backend/prisma/schema.prisma` · `services/course.service.ts` · `controllers/course.controller.ts` · `routes/course.routes.ts` · `services/lesson.service.ts` · `services/student-profile.service.ts` · `services/tutor/{tutor-session,ed-tutor,prompt-builder}.service.ts` · `services/progress.service.ts` · `services/quiz.service.ts` · `packages/shared/src/constants/{curriculum,class-profiles,ed-voice}.ts` · `packages/shared/src/types/{student,tutor}.types.ts` · `apps/frontend/src/app/learn/**` · `apps/frontend/src/app/courses/**`

---

## B. Current DB model capabilities

What the existing models can and cannot carry, field by field.

**`Course`** — `title`, `slug` (unique), `description`, `shortSummary`, `thumbnailUrl`, `status`, `isPublished`, `level`, `categoryId`.
- ✅ Enough to represent one `(class, subject)` pair.
- ⚠️ **No `classLevel` and no `subject` column.** Class scoping is currently a slug allowlist in application config, not a database fact.
- ⚠️ **`instructorId` is a required FK with `onDelete: Restrict`.** Curriculum has no human author, so seeding needs an owner row (see §E).
- ⚠️ `price`, `level` (`BEGINNER/INTERMEDIATE/ADVANCED`) are marketplace leftovers with no meaning for school curriculum.

**`Module`** — `title`, `description`, `sortOrder`.
- ✅ Represents a chapter cleanly. `sortOrder` = chapter number.
- ⚠️ No chapter number distinct from sort position, and no textbook reference.

**`Lesson`** — `title`, `slug` (unique per module), `description`, `type` (`VIDEO`/`TEXT`), `content` (`@db.Text`), `videoUrl`, `videoDuration`, `sortOrder`, `isFreePreview`, `isPublished`.
- ✅ `type: TEXT` + `content` can hold a full teaching write-up in Markdown.
- ✅ `description` is a natural home for the learning objective.
- ⚠️ **No typed fields** for key terms, misconceptions, prerequisites, difficulty or estimated time.
- ⚠️ No `conceptKey`, so nothing stable to join mastery or mistake data to later.

**`Quiz`** — `moduleId` *and* `lessonId` both nullable.
- ✅ **A quiz can already attach to a topic or a chapter with no schema change.** This is the single luckiest thing about the existing schema.

**`LessonProgress`** — unique per `(userId, lessonId)`.
- ✅ Already gives per-topic progress for free.
- ⚠️ Boolean `isCompleted` only; the four-state model in §I has to be derived.

---

## C. Proposed Class → Subject → Chapter → Topic structure

```
ClassLevel (enum, exists)        CLASS_6 | CLASS_7 | CLASS_8
  └── Board (enum, exists)       CBSE
      └── SubjectKey (enum, exists)   MATH | SCIENCE | SOCIAL_SCIENCE | ENGLISH
          └── Chapter            e.g. "Mindful Eating: A Path to a Healthy Body"
              └── Topic          e.g. "Why our bodies need carbohydrates"
```

A **Topic** is the atomic unit and the contract with ED: *one thing ED can teach in a single session, start to finish.* If a topic can't be taught in one sitting, it's a chapter.

12 `(class, subject)` combinations → 12 curriculum courses.

### ⚠️ On the chapter list in the brief — do not seed it

The Class 6 Science list in the task brief (*Components of Food, Sorting Materials into Groups, Separation of Substances, Getting to Know Plants, Body Movements, …*) is the **pre-2024 NCERT syllabus**. It is outdated.

Two checks I ran:

- **Class 6 Science** is now **“Curiosity”** (2024–25 onward, NCF-SE 2023), reported as **12 chapters** with entirely different titles — *The Wonderful World of Science; Diversity in the Living World; Mindful Eating: A Path to a Healthy Body; Exploring Magnets; Measurement of Length and Motion; Materials Around Us; Temperature and its Measurement; A Journey through States of Water; Methods of Separation in Everyday Life; Living Creatures: Exploring their Characteristics; …; Beyond Earth.* One title was truncated in my results.
- **Class 6 Maths** is now **“Ganita Prakash”**, reported as **10 chapters**, with **Algebra and Ratio & Proportion removed** from Class 6 for 2025–26. Class 7 Maths is also Ganita Prakash.

**Confidence:** these came from secondary education sites, not `ncert.nic.in` directly. Treat them as *indicative, pending verification*. I have deliberately not written any chapter list into code.

**Consequence for design:** the NCF rollout is staged — Class 6 in 2024, Class 7 in 2025, Class 8 believed later and **unverified**. The three classes may therefore sit on *different textbook generations simultaneously*. That is a structural fact, not a content detail, and it argues for recording a syllabus/textbook version per course (§F).

**Required before any seeding:** verify all 12 `(class, subject)` chapter lists against the current official NCERT textbook contents pages on `ncert.nic.in`, and record the textbook name, edition year and retrieval date alongside the data.

### Separation of concerns

| Category | Status |
|---|---|
| Existing project data | 7 legacy software-engineering courses, 9 modules, 17 lessons. Real, retained, hidden from students |
| Proposed structure | Everything in §C–§F of this document. Design only |
| Actual CBSE content | **Not present and not verified.** Requires official sourcing before seeding |

---

## D. Mapping to existing Course / Module / Lesson

**Recommendation: reuse the existing three models. Introduce no new entities in the first phase.**

| Curriculum concept | Existing model | Encoding |
|---|---|---|
| Class × Subject | `Course` | slug `class-6-science`, title "Class 6 Science" |
| Chapter | `Module` | `sortOrder` = chapter number |
| Topic | `Lesson` | `type: TEXT`, `sortOrder` = position in chapter, slug = `conceptKey` |
| Learning objective | `Lesson.description` | one sentence |
| Teaching material | `Lesson.content` | structured Markdown |
| Topic practice | `Quiz.lessonId` | already supported |
| Chapter practice | `Quiz.moduleId` | already supported |
| Per-topic progress | `LessonProgress` | already supported |

Why not new models: the hierarchy is a genuine three-level tree and `Course → Module → Lesson` already is one. Creating `Subject`/`Chapter`/`Topic` tables would duplicate the shape, orphan the working quiz and progress plumbing, and force a migration before a single line of content exists. The honest cost of reuse is naming drift — the code says `Course` where the product says *Subject* — which is a documentation problem, not an architectural one.

**Slug convention** (load-bearing, since it carries class and subject until §F lands):

```
course : class-<6|7|8>-<math|science|social-science|english>
lesson : <chapter-key>.<topic-key>     e.g. mindful-eating.carbohydrates
```

---

## E. What can be implemented without schema changes

1. **All 12 curriculum courses, chapters and topics** — rows in existing tables.
2. **Class + subject scoping** — extend `CLASS_COURSE_SLUGS`, and add a `COURSE_SUBJECTS: Record<string, SubjectKey>` map beside it in `packages/shared/src/constants/curriculum.ts`.
3. **Teaching content for ED** — Markdown in `Lesson.content` under fixed `##` headings (`Objective`, `Explanation`, `Examples`, `Key terms`, `Common misconceptions`, `Check understanding`). The prompt builder parses the headings it needs.
4. **Topic and chapter quizzes** — `Quiz.lessonId` / `Quiz.moduleId` already exist.
5. **Per-topic progress** — `LessonProgress` already exists.
6. **Learn navigation** (§H) — pure frontend plus one read endpoint.
7. **Curriculum context in ED's prompt** (§G) — new prompt layer, no storage change.

**One bridge is needed:** `Course.instructorId` is required. Proposal — a single system row, `curriculum@edplatform.internal`, `isActive: false`, no `clerkUserId`, created by the seed script and referenced by all 12 courses. It cannot sign in (no Clerk identity, inactive) and holds no RBAC meaning. It exists only to satisfy the FK until the column is dropped in §F.

**Headline:** the entire first content phase is achievable with **zero migrations**.

---

## F. What would eventually require schema changes

Ordered by value, to be done *after* content proves the model.

| # | Change | Why |
|---|---|---|
| F1 | `Course.classLevel: ClassLevel`, `Course.subject: SubjectKey`, `Course.board: Board` | Makes class scoping a database query instead of a config allowlist. Removes the slug-as-data smell and the drift risk in §L |
| F2 | `Course.syllabusVersion: String`, `Course.textbookName: String?` | The staged NCF rollout means classes sit on different textbook generations. Without this, nothing records which syllabus a course encodes |
| F3 | `Lesson.conceptKey: String` (unique per course) | A stable join key for mastery, mistake ledger and prerequisites. Currently only the slug, which is editable |
| F4 | `Lesson.difficulty: Int`, `Lesson.estimatedMinutes: Int` | Needed for pacing and the 2-minute challenge |
| F5 | Structured teaching fields — `objective`, `keyTerms Json`, `misconceptions Json` as columns, or a `LessonTeaching` 1:1 model | Replaces Markdown-heading parsing with typed, queryable data |
| F6 | `LessonPrerequisite` join table (`lessonId`, `prerequisiteLessonId`) | Prerequisite graph; also the foundation for the learning map |
| F7 | `QuizQuestion.conceptId` → `Lesson` | Lets a wrong answer point at a topic. Prerequisite for weak-area detection |
| F8 | Drop `Course.price`, `Course.level`, `Course.instructorId`; drop `Certificate`, `Report` | Marketplace leftovers. `instructorId` is `onDelete: Restrict`, so this is the riskiest migration and belongs last |

**Not now:** mastery models, learning-map tables, challenge tables, anything multi-board beyond the existing `Board` enum.

---

## G. How curriculum context enters ED's prompt

### The rule

> Curriculum context enters the prompt **if and only if** `TutorSession.lessonId` is non-null **and** that lesson belongs to a course visible to the student's class.

A homepage session has `lessonId = null`, so it gets no curriculum layer — which is exactly the behaviour already verified by tests in `verify_ed_voice.ts` (Suite I) and must not regress.

### Proposed layer

Insert **after** the subject layer, **before** preferences:

```
safety → ED voice → class profile → subject → [curriculum] → preferences → turn action
```

Built from the topic, hard-capped at roughly 150 words so it cannot crowd out the voice guide:

```
CURRENT TOPIC: Mindful Eating — why our bodies need carbohydrates
Class 6 Science · Chapter 3
Objective: explain why the body needs carbohydrates and name common sources.
Key terms: carbohydrate, energy, starch
Watch for: students often think all carbohydrates are "sugar".
Teach this topic. If the student drifts, answer briefly and bring them back.
```

### ⚠️ Security gap this design must close first

Two places currently let a Class 6 student reach legacy or out-of-class content through the API, even though the UI hides it:

1. **`tutor-session.service.ts` → `createSession()`** checks only that the lesson *exists*:
   ```ts
   if (input.lessonId) {
     const lesson = await prisma.lesson.findUnique({ where: { id: input.lessonId }, select: { id: true } });
     if (!lesson) throw new NotFoundError('Lesson not found');
   }
   ```
   `POST /tutor/sessions { lessonId: "<legacy lesson id>" }` therefore attaches *Distributed Systems & Resilient Architectures* as course context for a Class 6 student. **This is the exact leakage we fixed in the UI, still reachable over HTTP.**

2. **`GET /courses/:idOrSlug` and `GET /lessons/:id`** gate on enrollment, not class. 10 enrollments already exist against legacy courses.

**Hard requirement:** before the curriculum layer ships, both paths must validate class visibility via `isCourseVisibleToClass()`, and a test must assert that a Class 6 student passing a legacy `lessonId` is refused. Adding the curriculum layer *without* this would make the leak worse, because the legacy course's content would then be injected deliberately rather than incidentally.

---

## H. How Learn should navigate

```
/learn                                   subjects for my class            (exists)
/learn/[subject]                         chapter cards                    (needs rework)
/learn/[subject]/[chapter]               topic list, with progress        (new)
/learn/[subject]/[chapter]/[topic]       topic page → "Learn with ED"     (new)
```

The topic page is a short read — objective, the idea in a few lines, key terms — with **Learn with ED** as the primary action, creating a session with that `lessonId`. The topic page is a doorway, not a destination.

**`/learn/[subject]` needs fixing:** it currently creates a tutor session and redirects immediately, so there is no chapter browsing at all. It becomes the chapter list; "ask ED about this subject" stays as a secondary action.

**Deliberately absent:** video players, certificates, enrollment CTAs, "course" or "module" wording in student-facing copy. Keep: progress indicators, topic quizzes.

Legacy `/courses/**` routes stay exactly as they are — they serve regression tests and are unreachable from student navigation.

---

## I. How Progress and Quiz should eventually connect

Four student-facing states, **derived** from existing tables — no new models now:

| State | Derivation |
|---|---|
| Not started | no `LessonProgress` row |
| Learning | `LessonProgress` exists, `isCompleted: false` |
| Practiced | a submitted `QuizAttempt` exists for a quiz on this topic |
| Understood | topic complete **and** a passing attempt |

"Mastered" is deliberately **not** in this list. Real mastery needs decay, spaced repetition and confidence data, which is a later phase.

Quizzes attach to topics today via `Quiz.lessonId`. The missing piece is `QuizQuestion.conceptId` (F7), without which a wrong answer can't point at a topic — so weak-area detection stays blocked until F3 + F7 land. Worth stating plainly so it isn't promised early.

---

## J. How legacy technical courses remain isolated

| Mechanism | Status |
|---|---|
| `CLASS_COURSE_SLUGS` allowlist — legacy slugs never listed | ✅ working |
| `GET /courses` filters by the student's stored class level | ✅ working |
| Class level read from profile, never from the request | ✅ working, un-spoofable |
| `GET /courses/:slug` direct URL | ⚠️ **open** — enrollment-gated only |
| `POST /tutor/sessions { lessonId }` | ⚠️ **open** — see §G |

Legacy rows are **not deleted**: they are the only multi-course data available for regression tests, and three of them are referenced by existing enrollments. Isolation is by filtering, not deletion.

---

## K. Proposed implementation phases

| Phase | Work | Schema change? |
|---|---|---|
| **C0 — Verify sources** | Confirm all 12 chapter lists against `ncert.nic.in`; record textbook, edition, retrieval date | No |
| **C1 — Close the leaks** | Class validation in `createSession` and on course/lesson detail, with tests. **Blocks C3** | No |
| **C2 — Pilot one subject** | `class-6-science` only: course + chapters + 3–4 topics, seed script, config maps, Learn chapter/topic routes | No |
| **C3 — Curriculum prompt layer** | Bounded curriculum layer; assert homepage sessions stay clean | No |
| **C4 — Remaining 11 courses** | Only after the pilot proves the content shape | No |
| **C5 — Schema hardening** | F1–F5: real class/subject columns, concept keys, typed teaching fields | **Yes** |
| **C6 — Progress + topic quizzes** | Four-state progress, topic quizzes, F7 | **Yes** |

The pilot in C2 exists so the content shape is validated against *one* real subject before 12 subjects of authored material are written against it.

---

## L. Risks and migration considerations

1. **Syllabus accuracy — highest risk.** The brief's chapter list is already outdated. Wrong chapter names in a children's study product destroy trust faster than a missing feature. C0 is non-negotiable, and the source must be recorded with the data.
2. **Staged NCF rollout.** Classes 6, 7 and 8 may be on different textbook generations at the same time. Without F2 there is no record of which syllabus a course encodes.
3. **`Lesson.content` as structured data.** Markdown-with-fixed-headings is pragmatic for C2 but is unqueryable and unvalidated — a typo'd heading silently drops a field. Acceptable short-term; F5 is the fix, and parsing should fail loudly rather than silently.
4. **Slug as data.** Until F1, class and subject live in a slug plus a config map. Rename a slug and a course silently vanishes for every student. Mitigation: a test asserting every slug in `CLASS_COURSE_SLUGS` resolves to a real course.
5. **Prompt budget.** Safety + voice + class + subject + preferences is already substantial. The curriculum layer must stay hard-capped or it will dilute the voice guide — the behaviour we just spent a phase getting right.
6. **`Course.instructorId` is `onDelete: Restrict`.** The system-owner row is a workaround. Dropping the column (F8) means reparenting every course and is the single riskiest migration in the plan — schedule it alone, with a verified backup.
7. **Existing enrollments.** 10 enrollments point at legacy courses. Any class-visibility check on enrollment paths must not break those rows or the regression suite that depends on them.
8. **Scope creep.** Everything in §C–§F is reachable without touching mastery engines, learning maps or challenge systems. Keeping those out is what makes this phase finishable.

---

## Sources consulted for the syllabus warning

Secondary sources only — **not** authoritative, flagged for verification in C0:

- [NCERT Solutions for Class 6 Science (Curiosity) — Physics Wallah](https://www.pw.live/school-prep/exams/ncert-solutions-for-class-6-science-curiosity)
- [About This Book — Curiosity, Class 6](https://bharatnotes.com/ncert/new-ncert/class-6/curiosity/)
- [Class 6 (Ganita Prakash & Old NCERT) — Teachoo](https://www.teachoo.com/subjects/cbse-maths/class-6)
- [Ganita Prakash — NCERT CIET](https://ciet.ncert.gov.in/audio-book/155)

Authoritative source to use in C0: NCERT textbook contents pages at `ncert.nic.in`.
