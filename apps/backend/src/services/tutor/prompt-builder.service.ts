import {
  CLASS_PROFILES,
  ED_SAFETY_RULES,
  ED_VOICE_GUIDE,
  EXPLANATION_STYLE_DIRECTIVES,
  LANGUAGE_DIRECTIVES,
  SUBJECT_ACCURACY_RULES,
  SUBJECT_DIRECTIVES,
  SUBJECT_LABELS,
  type ClassLevel,
  type ExplanationStyle,
  type Language,
  type SubjectKey,
  type TutorQuickAction
} from '@edplatform/shared';

export interface TutorPromptContext {
  classLevel: ClassLevel;
  subject?: SubjectKey | null;
  language: Language;
  explanationStyle: ExplanationStyle;
  studentFirstName?: string | null;
  /**
   * Set only when the session was opened from inside a curriculum topic, and
   * built entirely from server-resolved rows - never from the request body.
   */
  curriculum?: CurriculumPromptContext | null;
  /** The quick action the student tapped for this turn, if any. */
  action?: TutorQuickAction | null;
  /**
   * Set only when the student is mid-quiz and asked for a hint. The question
   * and its option texts are resolved on the server from a question the
   * student is authorised to see; the answer key is never loaded, so there is
   * nothing here that could reveal it.
   */
  quizQuestion?: QuizQuestionPromptContext | null;
}

/** A question the student is currently looking at, minus the answer key. */
export interface QuizQuestionPromptContext {
  prompt: string;
  options: string[];
}

/**
 * What ED is told about where the student is in their syllabus.
 *
 * Every field is resolved on the server from the Lesson -> Module -> Course
 * chain and the stored StudentProfile. The client sends a lessonId and nothing
 * else; it cannot name the chapter, the book or the course.
 */
export interface CurriculumPromptContext {
  textbook: string | null;
  courseTitle: string;
  chapterTitle: string;
  /**
   * The topic, when the session is anchored to one.
   *
   * Null for a chapter-level session. 139 of the 149 curriculum chapters have
   * no written topics, so "I know the chapter and there is no topic" is an
   * ordinary state, not a degraded one - and the prompt says so plainly
   * rather than implying the student has read something they have not.
   */
  topicTitle: string | null;
  topicObjective: string | null;
  /**
   * A short reviewed teaching reference for this topic, when one is stored.
   * Absent or null renders nothing at all, so a topic without a brief gets
   * exactly the prompt it got before briefs existed.
   */
  teachingBrief?: string | null;
}

function classLayer(context: TutorPromptContext): string {
  const profile = CLASS_PROFILES[context.classLevel];
  const stepWord = profile.stepsPerResponse === 1 ? 'step' : 'steps';

  return `THIS STUDENT:
- Class: ${profile.label} (${profile.approximateAge})
- Sentences: keep them under about ${profile.maxSentenceWords} words.
- Vocabulary: ${profile.vocabulary}
- Examples: ${profile.exampleStyle}
- Questions you ask: ${profile.questioningStyle}
- Notation: ${profile.formalism}
- Exams: ${profile.examFraming}
- Depth: keep the explanation to roughly ${profile.stepsPerResponse} ${stepWord}. Answer fully, but don't go beyond what this class needs.
- If the student is stuck and asks for help repeatedly, you have about ${profile.hintRungs} nudges before you should just work it through with them.`;
}

function preferenceLayer(context: TutorPromptContext): string {
  const lines = [
    LANGUAGE_DIRECTIVES[context.language],
    EXPLANATION_STYLE_DIRECTIVES[context.explanationStyle]
  ];

  if (context.studentFirstName) {
    lines.push(
      `Use their first name, ${context.studentFirstName}, occasionally - not in every message.`
    );
  }

  return `PREFERENCES:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

/**
 * Per-turn directive for a quick action. Each one is a different teaching move on
 * the same concept, not a different model or a canned response.
 */
const ACTION_DIRECTIVES: Record<TutorQuickAction, string> = {
  hint: `THIS TURN: the student tapped "Hint". Give exactly ONE small next hint toward the current step. Do not solve the step, do not give the answer, and do not re-explain what you already said. End by inviting one attempt.`,

  simpler: `THIS TURN: the student tapped "Simpler". Re-explain the SAME idea in an easier way than your last message. Use shorter sentences and more everyday words. Do NOT reuse your previous wording - find a different, simpler route in.`,

  real_example: `THIS TURN: the student tapped "Real example". Open with one concrete everyday situation from Indian school life that shows this idea in action, then connect it back to the concept in one or two sentences.`,

  quiz_me: `THIS TURN: the student tapped "Quiz me". Ask ONE short practice question on what you have just been working on, pitched at this student's class level. Ask only the question - no answer, no explanation, no second question. Wait for their attempt, then mark it kindly and specifically.`,

  still_confused: `THIS TURN: the student tapped "I still don't understand". Your previous explanation did not land, so change strategy completely - do not repeat it.

Move one rung down this ladder from wherever you were:
1. Simpler words, shorter sentences, one less step.
2. A concrete physical analogy using objects they can picture.
3. A described visual - lay it out as a simple labelled diagram in text, or a small table.
4. Micro-steps: one single step, then stop and ask.
5. A worked twin - fully solve a problem with the same structure but different numbers, then return to the original.

Pick the next rung, use it, and finish by checking understanding with one short question.`
};

/**
 * Phrases that mean "I still don't understand" when typed rather than tapped.
 *
 * Without this, a student who types their confusion gets a normal turn and ED
 * is free to restate the same explanation - the exact failure the escalation
 * ladder exists to prevent. Tapping the button and typing the words should
 * behave identically.
 */
const TYPED_CONFUSION_PATTERNS: RegExp[] = [
  /\bi (still )?(don'?t|do not|dont) (get|understand|follow)\b/i,
  /\b(still )?(not|dont|don'?t) (getting|understanding) (it|this)\b/i,
  /\bi'?m (still )?(confused|lost)\b/i,
  /\bthat (still )?(doesn'?t|does not) make sense\b/i,
  /\bmakes no sense\b/i,
  /\bi'?m not following\b/i
];

/**
 * Infers a quick action from free text when the student did not tap one.
 * Returns null when the message is an ordinary question.
 */
export function detectImplicitAction(message: string): TutorQuickAction | null {
  const text = message.trim();
  if (text.length === 0) return null;
  if (TYPED_CONFUSION_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'still_confused';
  }
  return null;
}

/**
 * Assembles the system prompt from ordered layers:
 * safety -> pedagogy -> class level -> preferences -> this turn's action.
 */
/** Literal newline, named so the templates below stay readable. */
const NEWLINE = '\n';

/**
 * The subject block: how to teach the subject, and - where one exists - the
 * accuracy corrections for it.
 *
 * The corrections ride on the subject rather than on the voice guide so a
 * Maths or English session never carries them. They are framed as corrections
 * to make if the topic comes up, not as topics to raise, because a rule in a
 * system prompt is otherwise read as an invitation to bring its subject up
 * unprompted.
 */
function subjectLayer(context: TutorPromptContext): string | null {
  if (!context.subject) return null;

  const accuracy = SUBJECT_ACCURACY_RULES[context.subject];
  const corrections = accuracy
    ? `${NEWLINE}${NEWLINE}GET THESE RIGHT IF THEY COME UP - accuracy corrections, not topics to raise on your own:${NEWLINE}${accuracy}`
    : '';

  return `SUBJECT: ${SUBJECT_LABELS[context.subject]}
- ${SUBJECT_DIRECTIVES[context.subject]}${corrections}`;
}

/**
 * Where the student is in their syllabus, as its own labelled block.
 *
 * Previously this was a single sentence appended to PREFERENCES, next to
 * language and explanation-style settings, and it carried only the lesson and
 * course titles - the chapter and the textbook never reached ED at all. A
 * model reading that could not tell the difference between "the student likes
 * step-by-step answers" and "the student is sitting in Chapter 1 of Curiosity".
 *
 * The closing paragraph is deliberate and load-bearing: context is meant to
 * aim the explanation, not fence the student in. A child reading about the
 * scientific method who asks what "hypothesis" means, or for an example from
 * cricket, must get a real answer - not a refusal because the word is not in
 * the chapter.
 */
function curriculumLayer(context: TutorPromptContext): string | null {
  const c = context.curriculum;
  if (!c) return null;

  const lines = [
    `- Course: ${c.courseTitle}`,
    // Named so ED can pitch to the right syllabus. It is a label, and the
    // next line says so, because naming an official book beside a topic
    // title reads like the book was supplied when none of it was.
    c.textbook ? `- Textbook this chapter comes from: ${c.textbook} (NCERT) - the name only; its text is not available to you` : null,
    `- Chapter: ${c.chapterTitle}`,
    c.topicTitle ? `- Topic they are reading right now: ${c.topicTitle}` : null,
    c.topicObjective ? `- What that topic is meant to teach: ${c.topicObjective}` : null,
    // Said out loud, because the alternative is ED opening with "as you read
    // in this chapter" to a student who has read nothing of it.
    c.topicTitle
      ? null
      : '- They have not read any topic from this chapter yet: nothing has been written for it.'
  ].filter((line): line is string => Boolean(line));

  // Same job, different starting point: with a topic, pitch to what they just
  // read; with only a chapter, introduce it without assuming any of it.
  const framing = c.topicTitle
    ? 'Use this to pitch and frame your answer: this is where they are in the syllabus, so aim at that level and that subject. You have the topic\'s title and objective above, not the page itself - so do not describe its wording, its examples or its figures as though you had read it. Answer their question and explain the idea properly.'
    : 'Use this to pitch and frame your answer: introduce the chapter at their class level, and do not assume they have covered any of it yet.';

  // The brief is the one piece of authored teaching material ED is given, so
  // it gets its own labelled block rather than being folded into the bullet
  // list - and the label states exactly what it is. Calling it "reviewed" is
  // load-bearing: nothing but a reviewed, original brief may ever be stored
  // in that column. Saying plainly that it is not NCERT text keeps C13.5.1's
  // source rule intact, because a student could otherwise be told "your
  // textbook says" on the strength of this block.
  const brief = c.teachingBrief?.trim()
    ? `${NEWLINE}${NEWLINE}WHAT THIS TOPIC TEACHES (reviewed brief written for you - ED's own material, NOT NCERT text and not a quotation from the student's book):
${c.teachingBrief.trim()}

Teach from this when it is relevant: it is what the page in front of them actually covers, so your wording and examples should line up with it. It is still not the page itself, so do not quote it back as though reading aloud, and do not attribute it to the textbook.`
    : '';

  return `WHERE THE STUDENT IS RIGHT NOW:
${lines.join('\n')}

${framing}${brief}

This is context, not a boundary. Answer whatever they actually ask. If they ask about a word, an idea or an example that is not in this chapter, answer it properly at their class level and then, only if it helps, link it back. Never tell a student their question is outside the topic, and never refuse because something is not in the textbook.`;
}

/**
 * Mid-quiz rules.
 *
 * Only added when the student is actually taking a quiz and asked for help, so
 * the ordinary tutor - which should answer plainly and first - is never
 * accidentally told to withhold answers.
 *
 * The question text and options are included because a hint about "question 3"
 * is useless without them. What is NOT included, and never loaded from the
 * database, is which option is correct: the service selects option text only.
 * So there is no answer key in this process to leak, regardless of what the
 * student types.
 */
function quizIntegrityLayer(context: TutorPromptContext): string | null {
  const question = context.quizQuestion;
  if (!question) return null;

  const options = question.options.map((text, index) => `  ${index + 1}. ${text}`).join('\n');

  return `QUIZ INTEGRITY - the student is mid-question right now:
Question: "${question.prompt}"
Options as the student sees them:
${options}

They are being marked on this, so do not hand it over. Do not say which option is right or wrong, do not rule options out for them, and do not give the answer even if they ask directly or say they have given up.

What you CAN do: point at the idea the question is really testing, re-explain that idea in plainer words, give a parallel example with different numbers or objects, or ask what their own thinking is so far. If they ask outright for the answer, say you would rather help them get there, and then actually help.

This replaces your usual answer-first habit for this one turn only, and it outranks anything above - including the teaching brief, which you may use to explain the idea but never to hand over the answer.`;
}

export function buildTutorSystemPrompt(context: TutorPromptContext): string {
  const layers = [
    ED_SAFETY_RULES,
    ED_VOICE_GUIDE,
    classLayer(context),
    subjectLayer(context),
    curriculumLayer(context),
    quizIntegrityLayer(context),
    preferenceLayer(context)
  ].filter((layer): layer is string => Boolean(layer));

  if (context.action) {
    layers.push(ACTION_DIRECTIVES[context.action]);
  }

  return layers.join('\n\n');
}

/**
 * The student-visible text stored for a quick-action turn, so a reopened session
 * reads as a real conversation rather than having unexplained gaps.
 */
export const ACTION_TRANSCRIPT_TEXT: Record<TutorQuickAction, string> = {
  hint: 'Give me a hint',
  simpler: 'Explain that more simply',
  real_example: 'Give me a real-life example',
  quiz_me: 'Quiz me on this',
  still_confused: "I still don't understand"
};

/** Short title for a new session, derived from the student's opening question. */
export function deriveSessionTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 60) return cleaned;
  return `${cleaned.slice(0, 57).trimEnd()}...`;
}
