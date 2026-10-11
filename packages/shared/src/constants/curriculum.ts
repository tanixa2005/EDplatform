import type { ClassLevel, SubjectKey } from '../types/student.types.js';

/**
 * Which courses each class level is allowed to see.
 *
 * Course rows carry no class level of their own, and adding one would mean a
 * schema migration. Until the real Class 6-8 curriculum exists, visibility is
 * decided here by slug: a course is shown to a class only if it is listed for
 * that class.
 *
 * These are the twelve canonical (class x subject) container slugs from
 * docs/curriculum-architecture.md. Registering them here is structure, not
 * content: no course rows exist for them yet, so students still see an empty
 * catalogue. What it does give us is a meaningful authorization gate - without
 * entries, every visibility check trivially denies and nothing can be tested.
 *
 * Every course currently in the database is legacy software-engineering
 * material (Distributed Systems, PostgreSQL Internals, Modern Web Application
 * Engineering and some test leftovers). None of those slugs appear here, so
 * those rows stay in the database and remain invisible to students.
 */
export const CLASS_COURSE_SLUGS: Record<ClassLevel, string[]> = {
  CLASS_6: ['class-6-math', 'class-6-science', 'class-6-social-science', 'class-6-english'],
  CLASS_7: ['class-7-math', 'class-7-science', 'class-7-social-science', 'class-7-english'],
  CLASS_8: ['class-8-math', 'class-8-science', 'class-8-social-science', 'class-8-english']
};

/**
 * Reverse lookup: which class a curriculum course slug belongs to, or null when
 * the slug is not curriculum at all (legacy courses, test leftovers).
 *
 * Useful for diagnostics and tests. Authorization should call
 * isCourseVisibleToClass() instead, so there is one gate rather than two.
 */
export function resolveCourseClassLevel(slug: string): ClassLevel | null {
  for (const level of Object.keys(CLASS_COURSE_SLUGS) as ClassLevel[]) {
    if (CLASS_COURSE_SLUGS[level].includes(slug)) return level;
  }
  return null;
}

/**
 * True only when the course is explicitly approved for that class.
 *
 * Fails closed: an unknown slug, or an unknown class, shows nothing. For a
 * product aimed at children, accidentally hiding content is a far cheaper
 * mistake than accidentally showing it.
 */
export function isCourseVisibleToClass(
  slug: string,
  classLevel: ClassLevel | null | undefined
): boolean {
  if (!classLevel) return false;
  return (CLASS_COURSE_SLUGS[classLevel] ?? []).includes(slug);
}

/**
 * Keywords used to guess which subject a free-form question belongs to.
 *
 * Deliberately a plain keyword match rather than a model call: it must be
 * deterministic, instant, free, and work identically with the Mock provider
 * during local development. It only has to be right often enough to frame the
 * tutor prompt - the class level does the heavier lifting.
 */
const SUBJECT_KEYWORDS: Record<SubjectKey, string[]> = {
  SCIENCE: [
    'plant', 'plants', 'sunlight', 'photosynthesis', 'chlorophyll', 'leaf', 'leaves',
    'cell', 'cells', 'atom', 'atoms', 'molecule', 'element', 'compound', 'mixture',
    'force', 'forces', 'gravity', 'friction', 'pressure', 'motion', 'speed', 'energy',
    'light', 'sound', 'heat', 'temperature', 'magnet', 'magnetic', 'electricity',
    'current', 'circuit', 'acid', 'acids', 'base', 'bases', 'alkali', 'chemical',
    'reaction', 'digestion', 'respiration', 'breathing', 'blood', 'heart', 'lungs',
    'skeleton', 'muscle', 'nutrition', 'vitamin', 'protein', 'microbe', 'bacteria',
    'virus', 'animal', 'animals', 'habitat', 'ecosystem', 'water cycle', 'evaporation',
    'condensation', 'solar', 'planet', 'planets', 'moon', 'star', 'stars', 'earth',
    'weather', 'soil', 'rock', 'rocks', 'metal', 'metals', 'oxygen', 'carbon dioxide',
    'float', 'floats', 'sink', 'density', 'volume of a gas', 'seed', 'seeds', 'root',
    'roots', 'stem', 'flower', 'photosynthesise', 'organ', 'organs'
  ],
  MATH: [
    'fraction', 'fractions', 'decimal', 'decimals', 'integer', 'integers', 'negative number',
    'algebra', 'algebraic', 'equation', 'equations', 'expression', 'variable',
    'geometry', 'triangle', 'triangles', 'quadrilateral', 'circle', 'angle', 'angles',
    'parallel', 'perpendicular', 'ratio', 'ratios', 'proportion', 'percentage', 'percent',
    'multiply', 'multiplication', 'divide', 'division', 'add', 'addition', 'subtract',
    'subtraction', 'sum of', 'product of', 'area', 'perimeter', 'volume', 'surface area',
    'mensuration', 'lcm', 'hcf', 'gcd', 'factor', 'factors', 'multiple', 'multiples',
    'prime', 'square root', 'cube root', 'exponent', 'exponents', 'power of', 'indices',
    'number line', 'rounding', 'estimate', 'average', 'mean', 'median', 'mode',
    'graph', 'coordinate', 'symmetry', 'congruent', 'simple interest', 'profit', 'loss',
    'numerator', 'denominator', 'equivalent fraction'
  ],
  SOCIAL_SCIENCE: [
    'history', 'historical', 'map', 'maps', 'atlas', 'latitude', 'longitude',
    'democracy', 'democratic', 'constitution', 'government', 'parliament', 'election',
    'panchayat', 'citizen', 'civics', 'rights', 'empire', 'mughal', 'mughals', 'maurya',
    'gupta', 'king', 'kings', 'kingdom', 'dynasty', 'emperor', 'revolt', 'freedom struggle',
    'independence', 'colonial', 'british rule', 'geography', 'continent', 'ocean',
    'river', 'rivers', 'mountain', 'mountains', 'plateau', 'plain', 'climate', 'monsoon',
    'resource', 'resources', 'agriculture', 'industry', 'population', 'census',
    'civilisation', 'civilization', 'harappa', 'indus valley', 'medieval', 'ancient india',
    'tribal', 'caste', 'equality', 'judiciary', 'legislature'
  ],
  ENGLISH: [
    'noun', 'nouns', 'pronoun', 'verb', 'verbs', 'adjective', 'adverb', 'preposition',
    'conjunction', 'tense', 'tenses', 'grammar', 'sentence', 'sentences', 'clause',
    'phrase', 'paragraph', 'essay', 'letter writing', 'formal letter', 'informal letter',
    'notice writing', 'story', 'poem', 'poetry', 'stanza', 'rhyme', 'simile', 'metaphor',
    'personification', 'figure of speech', 'active voice', 'passive voice', 'punctuation',
    'comma', 'apostrophe', 'spelling', 'synonym', 'antonym', 'vocabulary', 'comprehension',
    'summary', 'summarise', 'summarize', 'narration', 'direct speech', 'indirect speech',
    'article', 'articles', 'subject verb agreement'
  ]
};

const SUBJECT_ORDER: SubjectKey[] = ['SCIENCE', 'MATH', 'SOCIAL_SCIENCE', 'ENGLISH'];

/**
 * Guesses the subject of a free-form student question, or null when nothing
 * matches. Used to give a homepage session subject framing, since a session
 * started from "Ask ED" has no lesson or subject to inherit.
 */
export function inferSubjectFromQuestion(question: string): SubjectKey | null {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;

  let best: SubjectKey | null = null;
  let bestScore = 0;

  for (const subject of SUBJECT_ORDER) {
    let score = 0;
    for (const keyword of SUBJECT_KEYWORDS[subject]) {
      // Pad with spaces so "add" does not match "address".
      if (text.includes(` ${keyword} `)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = subject;
    }
  }

  return best;
}


/**
 * The official NCERT textbook each curriculum course follows.
 *
 * Course rows do not store the book name - adding a column would mean a schema
 * migration - and ED needs it, because "Curiosity" is what the book on the
 * student's desk actually says on the cover. Saying "your Science textbook"
 * when the child is holding a book called Curiosity is the kind of small
 * disconnect that makes a tutor feel generic.
 *
 * Every value here is transcribed from the **Textbook:** lines in
 * docs/curriculum-map.md, which are VERIFIED against the official NCERT PDFs.
 * None of it is from memory. Two-part books (Ganita Prakash Part I/II,
 * Exploring Society Part 1/2) collapse to the book name, because one course
 * container holds both parts and the part marker already lives on the module.
 */
export const CURRICULUM_TEXTBOOKS: Record<string, string> = {
  'class-6-math': 'Ganita Prakash',
  'class-6-science': 'Curiosity',
  'class-6-social-science': 'Exploring Society: India and Beyond',
  'class-6-english': 'Poorvi',

  'class-7-math': 'Ganita Prakash',
  'class-7-science': 'Curiosity',
  'class-7-social-science': 'Exploring Society: India and Beyond',
  'class-7-english': 'Poorvi',

  'class-8-math': 'Ganita Prakash',
  'class-8-science': 'Curiosity',
  'class-8-social-science': 'Exploring Society: India and Beyond',
  'class-8-english': 'Poorvi'
};

/**
 * The textbook for a course slug, or null when the slug is not curriculum at
 * all. Legacy technical courses have no NCERT textbook and must not be given a
 * fabricated one.
 */
export function textbookForCourseSlug(slug: string): string | null {
  return CURRICULUM_TEXTBOOKS[slug] ?? null;
}

/**
 * The subject a curriculum course teaches, read off its canonical slug.
 *
 * Needed because a session attached to a curriculum lesson must not guess its
 * subject from the student's wording. inferSubjectFromQuestion() is a keyword
 * match built for free-form homepage questions, and it has no entry for the
 * bare word "science" - so "Why is science more than just knowing facts?",
 * asked from inside Class 6 Science, resolved to no subject at all and ED lost
 * its subject framing. When the course is known, the subject is known.
 */
export function subjectForCourseSlug(slug: string): SubjectKey | null {
  if (resolveCourseClassLevel(slug) === null) return null;
  if (slug.endsWith('-social-science')) return 'SOCIAL_SCIENCE';
  if (slug.endsWith('-science')) return 'SCIENCE';
  if (slug.endsWith('-math')) return 'MATH';
  if (slug.endsWith('-english')) return 'ENGLISH';
  return null;
}
