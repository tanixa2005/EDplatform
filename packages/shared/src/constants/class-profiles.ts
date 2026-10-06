import type { ClassLevel, ExplanationStyle, Language, SubjectKey } from '../types/student.types.js';

/**
 * How ED teaches at each class level.
 *
 * This is the class-adaptive contract for the tutor. It lives in the shared
 * package on purpose: prompt behaviour is part of the product, so a change here
 * shows up in a diff next to the types it affects instead of being buried in a
 * template literal inside a service.
 *
 * Phase 1 keeps this to the minimum the tutor needs to know about the student's
 * class. There is deliberately no curriculum/concept graph here yet.
 */
export interface ClassProfile {
  classLevel: ClassLevel;
  /** Student-facing label, e.g. "Class 6". */
  label: string;
  /** Typical age range, used only to calibrate tone in the prompt. */
  approximateAge: string;
  maxSentenceWords: number;
  /** How many teaching steps to give before pausing to check understanding. */
  stepsPerResponse: number;
  /** How many hints to offer before ED works through the full answer. */
  hintRungs: number;
  vocabulary: string;
  exampleStyle: string;
  questioningStyle: string;
  formalism: string;
  examFraming: string;
}

export const CLASS_PROFILES: Record<ClassLevel, ClassProfile> = {
  CLASS_6: {
    classLevel: 'CLASS_6',
    label: 'Class 6',
    approximateAge: '11-12 years old',
    maxSentenceWords: 12,
    stepsPerResponse: 1,
    hintRungs: 4,
    vocabulary:
      'Everyday words only. Define every subject term the first time you use it, in one short sentence.',
    exampleStyle:
      'Physical, countable things the student can picture: slices of roti or pizza, marbles, rupees, cricket runs, steps on a staircase.',
    questioningStyle:
      'Ask one short question with a single clear answer. Yes/no or one-number answers are ideal.',
    formalism:
      'No symbols beyond + - x and division. Write words instead of notation wherever you can.',
    examFraming: 'Never mention exams or marks.'
  },
  CLASS_7: {
    classLevel: 'CLASS_7',
    label: 'Class 7',
    approximateAge: '12-13 years old',
    maxSentenceWords: 18,
    stepsPerResponse: 2,
    hintRungs: 3,
    vocabulary:
      'Some formal terms are fine, but define each one inline the first time it appears.',
    exampleStyle:
      'Everyday situations with a bit of reasoning: shopping and discounts, recipes, cricket averages, travel time and speed.',
    questioningStyle:
      'Ask the student to explain why, not just what. One question at a time.',
    formalism: 'Basic algebraic notation is fine. Keep expressions short.',
    examFraming:
      'Mention exam-style phrasing only if the student asks about tests.'
  },
  CLASS_8: {
    classLevel: 'CLASS_8',
    label: 'Class 8',
    approximateAge: '13-14 years old',
    maxSentenceWords: 25,
    stepsPerResponse: 3,
    hintRungs: 2,
    vocabulary:
      'Use the normal subject register. You can assume standard terms are known.',
    exampleStyle:
      'Abstract and symbolic reasoning, with a concrete example only when it genuinely helps.',
    questioningStyle:
      'Ask multi-step and "what would happen if" questions that connect ideas together.',
    formalism: 'Full standard notation. Multi-step working is expected.',
    examFraming:
      'You may point out how a concept is usually asked in exams when it is useful.'
  }
};

export const EXPLANATION_STYLE_DIRECTIVES: Record<ExplanationStyle, string> = {
  SIMPLE:
    'This student prefers the simplest possible explanation. Lead with a plain-language summary in one or two short sentences before any detail.',
  STEP_BY_STEP:
    'This student prefers numbered steps. Break the idea into clearly numbered steps and keep each step to one action.',
  REAL_LIFE:
    'This student learns best from real-life examples. Open with a concrete everyday situation, then connect it back to the concept.',
  EXAM_FOCUSED:
    'This student wants exam-oriented help. Point out what a question is really testing and the common mistakes that lose marks.'
};

export const LANGUAGE_DIRECTIVES: Record<Language, string> = {
  ENGLISH: 'Reply in clear, simple English.',
  HINDI: 'Reply in simple Hindi (Devanagari script). Keep technical terms in English where that is what the textbook uses.',
  HINGLISH:
    'Reply in Hinglish: conversational Hindi written in Roman script, mixed naturally with English subject terms.'
};

export const CLASS_LEVELS: ClassLevel[] = ['CLASS_6', 'CLASS_7', 'CLASS_8'];

export const CLASS_LEVEL_LABELS: Record<ClassLevel, string> = {
  CLASS_6: 'Class 6',
  CLASS_7: 'Class 7',
  CLASS_8: 'Class 8'
};

export const SUBJECT_KEYS: SubjectKey[] = ['MATH', 'SCIENCE', 'SOCIAL_SCIENCE', 'ENGLISH'];

export const SUBJECT_LABELS: Record<SubjectKey, string> = {
  MATH: 'Mathematics',
  SCIENCE: 'Science',
  SOCIAL_SCIENCE: 'Social Science',
  ENGLISH: 'English'
};

export const EXPLANATION_STYLE_LABELS: Record<ExplanationStyle, string> = {
  SIMPLE: 'Simple explanation',
  STEP_BY_STEP: 'Step by step',
  REAL_LIFE: 'Real-life examples',
  EXAM_FOCUSED: 'Exam focused'
};

export const EXPLANATION_STYLE_HINTS: Record<ExplanationStyle, string> = {
  SIMPLE: 'Plain words, straight to the point',
  STEP_BY_STEP: 'One numbered step at a time',
  REAL_LIFE: 'Start from something I already know',
  EXAM_FOCUSED: 'What the question is really testing'
};

/** Languages a student can pick today. Hindi and Hinglish arrive in Phase 4. */
export const AVAILABLE_LANGUAGES: Language[] = ['ENGLISH'];

export const LANGUAGE_LABELS: Record<Language, string> = {
  ENGLISH: 'English',
  HINDI: 'हिंदी (Hindi)',
  HINGLISH: 'Hinglish'
};
