# EDplatform Curriculum Map

**Status:** research complete. No curriculum implemented, no database touched, no schema change.
**Research date:** 2026-10-07 · **Academic year:** 2026–27 · **Board:** CBSE (prescribes NCERT)
**Companion:** [curriculum-architecture.md](./curriculum-architecture.md)

## Method

Chapter lists were extracted from the **official NCERT prelims PDFs** on `ncert.nic.in` (the `…ps.pdf` files, which contain each book's printed Contents page), using `pdftotext -layout`. Every list below is transcribed from the printed Contents page of the official textbook.

The earlier extraction failure was a tooling problem, not a source problem — `pdftotext` decodes the subset fonts correctly where a naive stream parser did not.

**No coaching site, blog, Wikipedia page or search snippet informed any chapter name in this document.**

Filename convention (useful for re-verification):
```
https://ncert.nic.in/textbook/pdf/<class><book><part>ps.pdf
class: f=6  g=7  h=8     book: gp=Ganita Prakash  cu=Curiosity  es=Exploring Society  pr=Poorvi
"ps" = prelims, containing the Contents page
```

**Part II / Part 2 existence was probed by HTTP status**, not assumed: `gegp2ps`, `gees2ps`, `hegp2ps`, `hees2ps` return 200; all `…cu2ps`, `…pr2ps` and every Class 6 part-2 URL return 404.

---

## Class 6

### Mathematics
**Textbook:** Ganita Prakash · **Source:** [fegp1ps.pdf](https://ncert.nic.in/textbook/pdf/fegp1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Single volume** (no Part II) · **Status: VERIFIED**

| # | Official chapter title |
|---|---|
| 1 | Patterns in Mathematics |
| 2 | Lines and Angles |
| 3 | Number Play |
| 4 | Data Handling and Presentation |
| 5 | Prime Time |
| 6 | Perimeter and Area |
| 7 | Fractions |
| 8 | Playing with Constructions |
| 9 | Symmetry |
| 10 | The Other Side of Zero |

### Science
**Textbook:** Curiosity · **Source:** [fecu1ps.pdf](https://ncert.nic.in/textbook/pdf/fecu1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| # | Official chapter title |
|---|---|
| 1 | The Wonderful World of Science |
| 2 | Diversity in the Living World |
| 3 | Mindful Eating: A Path to a Healthy Body |
| 4 | Exploring Magnets |
| 5 | Measurement of Length and Motion |
| 6 | Materials Around Us |
| 7 | Temperature and its Measurement |
| 8 | A Journey through States of Water |
| 9 | Methods of Separation in Everyday Life |
| 10 | Living Creatures: Exploring their Characteristics |
| 11 | Nature's Treasures |
| 12 | Beyond Earth |

### Social Science
**Textbook:** Exploring Society: India and Beyond · **Source:** [fees1ps.pdf](https://ncert.nic.in/textbook/pdf/fees1ps.pdf) · **Edition:** First Edition, reprinted · **Single volume** · **Status: VERIFIED**

Organised in five Themes. Chapters are numbered continuously across themes.

| # | Official chapter title | Theme |
|---|---|---|
| 1 | Locating Places on the Earth | A — India and the World: Land and the People |
| 2 | Oceans and Continents | A |
| 3 | Landforms and Life | A |
| 4 | Timeline and Sources of History | B — Tapestry of the Past |
| 5 | India, That Is Bharat | B |
| 6 | The Beginnings of Indian Civilisation | B |
| 7 | India's Cultural Roots | C — Our Cultural Heritage and Knowledge Traditions |
| 8 | Unity in Diversity, or 'Many in the One' | C |
| 9 | Family and Community | D — Governance and Democracy |
| 10 | Grassroots Democracy — Part 1: Governance | D |
| 11 | Grassroots Democracy — Part 2: Local Government in Rural Areas | D |
| 12 | Grassroots Democracy — Part 3: Local Government in Urban Areas | D |
| 13 | The Value of Work | E — Economic Life Around Us |
| 14 | Economic Activities Around Us | E |

Also present, not chapters: *Introduction: Why Social Science?* (p1), Glossary.

### English
**Textbook:** Poorvi · **Source:** [fepr1ps.pdf](https://ncert.nic.in/textbook/pdf/fepr1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

Organised in **5 thematic Units**, not chapters.

| Unit | Official unit title | Pieces |
|---|---|---|
| 1 | Fables and Folk Tales | A Bottle of Dew · The Raven and the Fox · Rama to the Rescue |
| 2 | Friendship | The Unlikely Best Friends · A Friend's Prayer · The Chair |
| 3 | Nurturing Nature | Neem Baba · What a Bird Thought · Spices that Heal Us |
| 4 | Sports and Wellness | Change of Heart · The Winner · Yoga—A Way of Life |
| 5 | Culture and Tradition | Hamara Bharat—Incredible India! · The Kites · Ila Sachani: Embroidering Dreams with her Feet · National War Memorial |

Note: Unit 5 lists **four** pieces, unlike the three in Units 1–4.

---

## Class 7

### Mathematics — Part I
**Textbook:** Ganita Prakash, Part I · **Source:** [gegp1ps.pdf](https://ncert.nic.in/textbook/pdf/gegp1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| # | Official chapter title |
|---|---|
| 1 | Large Numbers Around Us |
| 2 | Arithmetic Expressions |
| 3 | A Peek Beyond the Point |
| 4 | Expressions using Letter-Numbers |
| 5 | Parallel and Intersecting Lines |
| 6 | Number Play |
| 7 | A Tale of Three Intersecting Lines |
| 8 | Working with Fractions |

### Mathematics — Part II
**Textbook:** Ganita Prakash, Part II · **Source:** [gegp2ps.pdf](https://ncert.nic.in/textbook/pdf/gegp2ps.pdf) · **Edition:** First Edition · **Status: VERIFIED**

Chapter numbering **restarts at 1** in Part II.

| # | Official chapter title |
|---|---|
| 1 | Geometric Twins |
| 2 | Operations with Integers |
| 3 | Finding Common Ground |
| 4 | Another Peek Beyond the Point |
| 5 | Connecting the Dots… |
| 6 | Constructions and Tilings |
| 7 | Finding the Unknown |

### Science
**Textbook:** Curiosity · **Source:** [gecu1ps.pdf](https://ncert.nic.in/textbook/pdf/gecu1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| # | Official chapter title |
|---|---|
| 1 | The Ever-Evolving World of Science |
| 2 | Exploring Substances: Acidic, Basic, and Neutral |
| 3 | Electricity: Circuits and their Components |
| 4 | The World of Metals and Non-metals |
| 5 | Changes Around Us: Physical and Chemical |
| 6 | Adolescence: A Stage of Growth and Change |
| 7 | Heat Transfer in Nature |
| 8 | Measurement of Time and Motion |
| 9 | Life Processes in Animals |
| 10 | Life Processes in Plants |
| 11 | Light: Shadows and Reflections |
| 12 | Earth, Moon, and the Sun |

### Social Science — Part 1
**Textbook:** Exploring Society: India and Beyond, Part 1 · **Source:** [gees1ps.pdf](https://ncert.nic.in/textbook/pdf/gees1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| # | Official chapter title | Theme |
|---|---|---|
| 1 | Geographical Diversity of India | A |
| 2 | Understanding the Weather | A |
| 3 | Climates of India | A |
| 4 | New Beginnings: Cities and States | B |
| 5 | The Rise of Empires | B |
| 6 | The Age of Reorganisation | B |
| 7 | The Gupta Era: An Age of Tireless Creativity | B |
| 8 | How the Land Becomes Sacred | C |
| 9 | From the Rulers to the Ruled: Types of Governments | D |
| 10 | The Constitution of India — An Introduction | D |
| 11 | From Barter to Money | E |
| 12 | Understanding Markets | E |

### Social Science — Part 2
**Textbook:** Exploring Society: India and Beyond, Part 2 · **Source:** [gees2ps.pdf](https://ncert.nic.in/textbook/pdf/gees2ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| # | Official chapter title | Theme |
|---|---|---|
| 1 | The Story of Indian Farming | A |
| 2 | India and Her Neighbours | A |
| 3 | Empires and Kingdoms: 6th to 10th Centuries | B |
| 4 | Turning Tides: 11th and 12th Centuries | B |
| 5 | India, a Home to Many | C |
| 6 | The State, the Government, and You | D |
| 7 | Infrastructure: Engine of India's Development | E |
| 8 | Banks and the Magic of Finance | E |

### English
**Textbook:** Poorvi · **Source:** [gepr1ps.pdf](https://ncert.nic.in/textbook/pdf/gepr1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| Unit | Official unit title | Pieces |
|---|---|---|
| 1 | Learning Together | The Day the River Spoke · Try Again · Three Days to See |
| 2 | Wit and Humour | Animals, Birds, and Dr. Dolittle · A Funny Man · Say the Right Thing |
| 3 | Dreams and Discoveries | My Brother's Great Invention · Paper Boats · North, South, East, West |
| 4 | Travel and Adventure | The Tunnel · Travel · Conquering the Summit |
| 5 | Bravehearts | A Homage to Our Brave Soldiers · My Dear Soldiers · Rani Abbakka |

---

## Class 8

### Mathematics — Part I
**Textbook:** Ganita Prakash, Part I · **Source:** [hegp1ps.pdf](https://ncert.nic.in/textbook/pdf/hegp1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

| # | Official chapter title |
|---|---|
| 1 | A Square and A Cube |
| 2 | Power Play |
| 3 | A Story of Numbers |
| 4 | Quadrilaterals |
| 5 | Number Play |
| 6 | We Distribute, Yet Things Multiply |
| 7 | Proportional Reasoning-1 |

### Mathematics — Part II
**Textbook:** Ganita Prakash, Part II · **Source:** [hegp2ps.pdf](https://ncert.nic.in/textbook/pdf/hegp2ps.pdf) · **Edition:** First Edition · **Status: VERIFIED**

**Part II exists** — confirmed by HTTP 200 (5.5 MB) and its own printed Contents page. Numbering restarts at 1.

| # | Official chapter title |
|---|---|
| 1 | Fractions in Disguise |
| 2 | The Baudhayana-Pythagoras Theorem |
| 3 | Proportional Reasoning-2 |
| 4 | Exploring Some Geometric Themes |
| 5 | Tales by Dots and Lines |
| 6 | Algebra Play |
| 7 | Area |

### Science
**Textbook:** Curiosity · **Source:** [hecu1ps.pdf](https://ncert.nic.in/textbook/pdf/hecu1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **Status: VERIFIED**

**13 chapters** — Class 8 Curiosity is one chapter longer than Classes 6 and 7.

| # | Official chapter title |
|---|---|
| 1 | Exploring the Investigative World of Science |
| 2 | The Invisible Living World: Beyond Our Naked Eye |
| 3 | Health: The Ultimate Treasure |
| 4 | Electricity: Magnetic and Heating Effects |
| 5 | Exploring Forces |
| 6 | Pressure, Winds, Storms, and Cyclones |
| 7 | Particulate Nature of Matter |
| 8 | Nature of Matter: Elements, Compounds, and Mixtures |
| 9 | The Amazing World of Solutes, Solvents, and Solutions |
| 10 | Light: Mirrors and Lenses |
| 11 | Keeping Time with the Skies |
| 12 | How Nature Works in Harmony |
| 13 | Our Home: Earth, a Unique Life Sustaining Planet |

### Social Science — Part 1
**Textbook:** Exploring Society: India and Beyond, Part 1 · **Source:** [hees1ps.pdf](https://ncert.nic.in/textbook/pdf/hees1ps.pdf) · **Edition:** First Edition **July 2025**, Reprint 2026-27 · **ISBN** 978-93-5729-293-1 · **Status: VERIFIED**

Corrects the earlier record: the Class 8 book **does** carry the *Exploring Society: India and Beyond* title, like Classes 6 and 7.

| # | Official chapter title | Theme |
|---|---|---|
| 1 | Natural Resources and Their Use | A |
| 2 | Reshaping India's Political Map | B |
| 3 | The Rise of the Marathas | B |
| 4 | The Colonial Era in India | B |
| 5 | Universal Franchise and India's Electoral System | D |
| 6 | The Parliamentary System: Legislature and Executive | D |
| 7 | Factors of Production | E |

Notes: Theme C does not appear in Part 1 (it is in Part 2). Theme B opens with front matter titled *A Note on History's Darker Periods* (p20), which is **not** a chapter.

### Social Science — Part 2
**Textbook:** Exploring Society: India and Beyond, Part 2 · **Source:** [hees2ps.pdf](https://ncert.nic.in/textbook/pdf/hees2ps.pdf) · **Edition:** **First Edition, June 2026** · **ISBN** 978-93-5729-102-6 · **Status: VERIFIED**

Part 2 **exists and has shipped**. It is the newest book in the matrix — first published June 2026, with no reprint line, which explains the separate NCERT notice.

| # | Official chapter title | Theme |
|---|---|---|
| 1 | World Geography: Some Glimpses | A |
| 2 | India's Long Road to Independence | B |
| 3 | A Journey Through Indian Architecture | C |
| 4 | The Role of the Judiciary in Our Society | D |
| 5 | Citizenship: Rights and Duties | D |
| 6 | Dynamics of Population | E |
| 7 | India's Urban Landscape | E |
| 8 | Cultural Currents: 13th to 17th Centuries | — |

Note: *Looking back and forward…* (p33) is front matter in Theme B, not a chapter.

### English
**Textbook:** Poorvi · **Source:** [hepr1ps.pdf](https://ncert.nic.in/textbook/pdf/hepr1ps.pdf) · **Edition:** First Edition, Reprint 2026-27 · **ISBN** 978-93-5729-940-4 · **Status: VERIFIED**

| Unit | Official unit title | Pieces |
|---|---|---|
| 1 | Wit and Wisdom | The Wit that Won Hearts · A Concrete Example · Wisdom Paves the Way |
| 2 | Values and Dispositions | A Tale of Valour: Major Somnath Sharma and the Battle of Badgam · Somebody's Mother · Verghese Kurien—I Too Had A Dream |
| 3 | Mystery and Magic | The Case of the Fifth Word · The Magic Brush of Dreams · Spectacular Wonders |
| 4 | Environment | The Cherry Tree · Harvest Hymn · Waiting for the Rain |
| 5 | Science and Curiosity | Feathered Friend · Magnifying Glass · Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science |

---

## Summary matrix

| Class | Mathematics | Science | Social Science | English |
|---|---|---|---|---|
| **6** | Ganita Prakash — 10 ch | Curiosity — 12 ch | Exploring Society — 14 ch | Poorvi — 5 units |
| **7** | Ganita Prakash — 8 + 7 ch | Curiosity — 12 ch | Exploring Society — 12 + 8 ch | Poorvi — 5 units |
| **8** | Ganita Prakash — 7 + 7 ch | Curiosity — **13** ch | Exploring Society — 7 + 8 ch | Poorvi — 5 units |

**All 12 cells VERIFIED.** 0 partially verified, 0 unverified.

Structure is **not** uniform across classes — Class 8 Science has 13 chapters where 6 and 7 have 12; Class 6 Maths and Social Science are single volumes where Classes 7 and 8 are two-part; Poorvi's unit *themes* differ per class; Class 6 Poorvi Unit 5 has four pieces where all others have three. None of this could have been inferred.

## Verification gaps

Everything required by this task is resolved. Remaining items are advisory, none blocking:

1. **`Reprint 2026-27` assumed to be a reprint, not a revision.** Every chapter list is read from the 2026-27 file itself, so the lists are correct for that file regardless — but if NCERT revised rather than reprinted, earlier-edition material would differ.
2. **Class 7/8 Maths Part II and Class 8 SST Part 2 show "First Edition" without a captured reprint line.** Likely a layout difference in the extracted text, not a different edition status. Confirm visually if it matters.
3. **Part II absence for Curiosity, Poorvi and all Class 6 books rests on HTTP 404** at the conventional URL. Strong but inferential — a part II at an unconventional filename would be missed.
4. **The NCERT Class 8 SST Part 2 notice** was still not retrievable (connection reset). Its content is now largely moot: Part 2 exists, has shipped, and its contents are verified. Read it before launch in case it carries an erratum.
5. **Poorvi grammar/skills coverage is not in the Contents page.** Units list literary pieces only; the language skills each unit teaches need the unit bodies.

## Content implementation recommendation

**Safe to implement now — all 12 courses and all modules.** Every chapter and unit title is officially verified, so `Course` and `Module` rows can be seeded for the full matrix.

Suggested order, lowest editorial risk first:

1. **Class 6 Mathematics** — 10 chapters, single volume, concepts least ambiguous. Best pilot.
2. **Class 6 Science** — 12 chapters, single volume.
3. **Class 7 and 8 Mathematics and Science** — needs the two-part numbering decision below.
4. **Social Science** — needs the Theme layer modelled.
5. **English** — last. Poorvi is literature-led, so topic decomposition is skill-based rather than chapter-based and needs a different editorial approach.

Two modelling decisions to settle before seeding modules:

- **Two-part books.** Part numbering restarts at 1, so `Module.sortOrder` must not be the printed chapter number alone. Use a continuous sequence (Part I ch 1–8 → 1–8, Part II ch 1–7 → 9–15) and keep the printed part/chapter reference in the title or description.
- **Themes in Social Science.** `Course → Module → Lesson` has no level for Themes. Either fold the theme into the module title, or treat Theme as the module and chapter as the lesson — but the latter conflicts with "a Lesson is one teachable topic".

**Still not to be created:** topics, concepts, lesson titles, objectives. This document contains official structure only, as required.

## Copyright

Only factual metadata is stored here — chapter and unit titles, numbering, textbook names, ISBNs, editions, official URLs. No chapter prose, exercises, diagrams or images. NCERT textbooks are copyrighted; authored lesson content must be written from subject knowledge, not from the textbook page.
