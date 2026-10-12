import { ED_BANNED_OPENERS } from '@edplatform/shared';
import { env } from '../../config/env.config.js';
import {
  CurriculumMeta,
  IAITutorProvider,
  StreamParams,
  StructuredParams
} from './ai-provider.interface.js';

/**
 * Offline stand-in for the live provider, used whenever OPENROUTER_API_KEY
 * is unset.
 *
 * It has to sound like ED, because otherwise local development is misleading.
 * Two earlier versions failed at that: the first returned the same
 * software-engineering answer to everything, and the second framed answers
 * correctly by class and subject but only asked the student what they thought.
 *
 * This version answers first, in ED's voice, using:
 *   - two tiny deterministic solvers (arithmetic, fraction values)
 *   - a small keyword topic base for common Class 6-8 questions
 *   - a generic fallback that uses the student's own words and does not bluff
 *
 * It never calls a network and never invents facts. The topic base is a
 * development aid, not curriculum coverage.
 */

const CLASS_LABEL: Record<string, string> = {
  CLASS_6: 'Class 6',
  CLASS_7: 'Class 7',
  CLASS_8: 'Class 8'
};

const SUBJECT_LABEL: Record<string, string> = {
  MATH: 'Maths',
  SCIENCE: 'Science',
  SOCIAL_SCIENCE: 'Social Science',
  ENGLISH: 'English'
};

/**
 * The notice that a reply came from the offline stand-in.
 *
 * Development only. In development it says what to set, which is what a
 * developer needs. In production it is never shown: a student there must not
 * be told to set an environment variable, and a deployment without a key is a
 * configuration error for whoever runs it to fix, not something to explain to
 * a child. Read at call time, so it follows the environment as it is.
 */
function offlineNote(): string {
  // The demo says it is offline, neutrally. It never mentions API keys.
  if (env.OFFLINE_DEMO_AI) return '_(Offline demo response.)_';
  if (env.NODE_ENV !== 'development') return '';
  return '_(Offline dev response. Set `OPENROUTER_API_KEY` for real tutoring.)_';
}

interface MockTopic {
  subject: 'MATH' | 'SCIENCE' | 'SOCIAL_SCIENCE' | 'ENGLISH';
  keywords: string[];
  /** The direct answer, one or two sentences. Always leads the reply. */
  answer: string;
  /** Short prose paragraphs that explain it properly. */
  explain: string[];
  /** Extra precision for Class 7 and 8 only. */
  deeper?: string;
  /** Everyday example, used for Class 6/7 and for the "Real example" action. */
  example?: string;
  /** Smallest possible nudge, for the "Hint" action. */
  hint: string;
  /** The single checking question ED closes on. */
  check: string;
}

const TOPICS: MockTopic[] = [
  // ---------------- SCIENCE ----------------
  {
    subject: 'SCIENCE',
    keywords: ['photosynthesis', 'sunlight', 'plants need', 'plant need', 'chlorophyll', 'plants make food'],
    answer:
      "Because sunlight gives plants the energy they need to make their own food.",
    explain: [
      "Plants can't eat the way we do, so they build their own food instead. They take in carbon dioxide from the air and water through their roots, and use the energy in sunlight to turn those into a sugar called glucose. That whole process is **photosynthesis**.",
      "The green stuff in leaves, chlorophyll, is what catches the sunlight. No light means no energy, which means no food — so the plant slowly starves."
    ],
    deeper:
      'Oxygen comes out as a by-product, which is why green plants keep the air breathable for the rest of us.',
    example:
      "You eat food to get energy. A plant makes its food, and sunlight is what powers the making. Leave one in a dark cupboard for two weeks and it goes pale and floppy — not thirsty, just starved of light.",
    hint: "Think about where a plant gets its food from, given it never eats anything.",
    check: 'So what are the three things a leaf needs to make food?'
  },
  {
    subject: 'SCIENCE',
    keywords: ['gravity', 'gravitational', 'why do things fall', 'things fall down', 'weight force'],
    answer:
      "Gravity is the force that pulls things toward each other. On Earth it pulls everything toward the ground.",
    explain: [
      "Every object with mass pulls on every other object. The bigger the mass, the stronger the pull. Earth is enormous, so its pull is strong enough to hold you, the air and the oceans down.",
      "That's why you come back down when you jump instead of drifting off."
    ],
    deeper:
      'The pull also weakens with distance, which is why astronauts far from Earth feel almost none of it.',
    example:
      "It's the same force keeping the Moon circling Earth rather than flying off into space.",
    hint: 'Think about what happens to a ball the moment it leaves your hand.',
    check: 'Why do you think you weigh less on the Moon than on Earth?'
  },
  {
    subject: 'SCIENCE',
    keywords: ['water cycle', 'evaporation', 'condensation', 'rain form', 'clouds form', 'how does rain'],
    answer:
      'Water keeps moving between the ground, the air and back again, and the Sun drives the whole loop.',
    explain: [
      'The Sun heats water in oceans, rivers and lakes until it turns to vapour and rises — that\'s **evaporation**. Higher up the air is colder, so the vapour cools back into tiny droplets, which is **condensation**, and those droplets form clouds.',
      'When enough droplets join together they get heavy and fall as rain, hail or snow. The water soaks into the ground or flows back to the sea, and it starts over.'
    ],
    deeper: 'Plants add to it too, releasing vapour through their leaves — that part is called transpiration.',
    example: 'The drops on the outside of a cold water bottle are condensation happening right in front of you.',
    hint: 'Start with what the Sun does to water sitting out in the open.',
    check: 'Which step is happening when a puddle disappears on a hot day?'
  },
  {
    subject: 'SCIENCE',
    keywords: ['respiration', 'why do we breathe', 'breathing', 'lungs'],
    answer:
      'You breathe because your cells need oxygen to release energy from the food you eat.',
    explain: [
      'Food holds energy, but your body can\'t use it directly. Cells break the food down using oxygen, and that releases usable energy. The process is called **respiration**.',
      'It also produces carbon dioxide as waste, which is what you breathe out.'
    ],
    deeper: 'Breathing moves the air in and out; respiration is the chemistry happening inside the cells.',
    hint: 'Think about what your body has to do to the food you eat before it\'s any use.',
    check: 'Which gas does your body use up, and which one does it get rid of?'
  },
  {
    subject: 'SCIENCE',
    keywords: ['float', 'floats', 'sink', 'sinks', 'density', 'ice float'],
    answer:
      'Something floats if it\'s lighter than the water it pushes out of the way, and sinks if it\'s heavier.',
    explain: [
      'When an object sits in water it shoves some water aside, and the water pushes back up. Compare the two weights and you have your answer.',
      'What matters is how tightly packed the material is — its **density** — not how big or heavy the object looks.'
    ],
    deeper: 'Ice floats because water expands as it freezes, so ice ends up less dense than the liquid.',
    example: 'A steel ship floats but a steel nail sinks, because the ship\'s shape pushes aside a huge amount of water.',
    hint: 'Compare the object\'s weight with the weight of the water it displaces.',
    check: 'So why does a steel ship float when a steel nail doesn\'t?'
  },
  {
    subject: 'SCIENCE',
    keywords: ['magnet', 'magnets', 'magnetic', 'north pole', 'south pole'],
    answer: 'A magnet has a north and a south pole. Opposite poles attract, matching poles push apart.',
    explain: [
      'Bring north near south and they pull together. Bring two norths together and they resist you.',
      'Magnets only attract certain metals — mainly iron, nickel and cobalt. Wood, plastic and paper do nothing.'
    ],
    deeper: 'A magnet hung freely turns to point north, which is exactly how a compass works.',
    hint: 'Try picturing what happens when you push two identical ends together.',
    check: 'If you hold two north poles close, do they pull together or push apart?'
  },

  // ---------------- MATHS ----------------
  {
    subject: 'MATH',
    keywords: ['fraction', 'fractions', 'numerator', 'denominator', 'equivalent fraction'],
    answer: "A fraction is just a way of saying \"part of a whole\".",
    explain: [
      'The bottom number tells you how many equal pieces the whole was cut into. The top number tells you how many of those pieces you have.',
      'So in $\\frac{3}{4}$: the 4 means the whole was cut into 4 equal pieces, and the 3 means you have 3 of them. The bottom one is called the denominator, the top one the numerator.'
    ],
    deeper:
      'Different-looking fractions can mean the same amount — $\\frac{1}{2}$ and $\\frac{2}{4}$ are equal, because twice as many pieces of half the size is the same share.',
    example:
      "Picture a pizza cut into 4 equal slices. Eat 1 and you've eaten $\\frac{1}{4}$ of it.",
    hint: 'Look at the bottom number first — it tells you how big each piece is.',
    check: 'If a cake is cut into 8 equal slices and you take 2, what fraction did you take?'
  },
  {
    subject: 'MATH',
    keywords: ['lcm', 'hcf', 'gcd', 'common multiple', 'common factor'],
    answer:
      'The HCF is the biggest number that divides both of your numbers. The LCM is the smallest number both of them divide into.',
    explain: [
      'A factor divides a number exactly; a multiple is what you get when you multiply it. HCF looks downward at factors, LCM looks upward at multiples.',
      'Easiest way in: list the multiples of each number and find the first one that shows up in both lists.'
    ],
    deeper: 'For any two numbers, HCF x LCM equals the two numbers multiplied together.',
    example: 'Two taps dripping every 4 and 6 seconds drip together every 12 seconds. That 12 is the LCM.',
    hint: 'Write out the multiples of each number and look for the first match.',
    check: 'What\'s the smallest number both 4 and 6 divide into exactly?'
  },
  {
    subject: 'MATH',
    keywords: ['integer', 'integers', 'negative number', 'negative numbers', 'number line'],
    answer:
      'Integers are whole numbers including the negative ones: ... -2, -1, 0, 1, 2 ... no fractions among them.',
    explain: [
      'On a number line, numbers get smaller as you move left. That\'s the bit that catches people out: -5 is less than -2, even though 5 is bigger than 2.',
      'Adding a positive number moves you right. Adding a negative moves you left.'
    ],
    deeper: 'Subtracting a negative is the same as adding a positive — you reverse direction twice.',
    example: 'A temperature of -3 degrees rising by 5 gives 2 degrees. You moved 5 steps right.',
    hint: 'Draw a number line and mark both numbers before deciding which is bigger.',
    check: 'Which is greater, -7 or -3?'
  },
  {
    subject: 'MATH',
    keywords: ['area', 'perimeter'],
    answer:
      'Perimeter is the distance around the edge of a shape. Area is how much surface it covers.',
    explain: [
      'For perimeter you add up the side lengths. For a rectangle\'s area you multiply length by breadth.',
      'The units give it away: perimeter is in cm, area in square cm.'
    ],
    deeper: 'Two shapes can have the same perimeter and completely different areas, so one doesn\'t tell you the other.',
    example: 'Fencing a field is perimeter. Buying grass to cover it is area.',
    hint: 'Ask whether the question is about going around the shape or covering it.',
    check: 'A rectangle is 5 cm by 3 cm. What\'s its area, and what\'s its perimeter?'
  },
  {
    subject: 'MATH',
    keywords: ['ratio', 'ratios', 'proportion'],
    answer: 'A ratio compares two amounts. 2:3 means for every 2 of the first thing there are 3 of the second.',
    explain: [
      'Ratios are about relative size, not totals — 2:3 and 4:6 say exactly the same thing.',
      'To share something in a ratio, add the parts first to find how many equal shares there are. For 2:3 that\'s 5 shares.'
    ],
    deeper: 'When two ratios are equal you have a proportion, which lets you solve for a missing amount.',
    example: 'Mixing squash 1:4 means 1 cup of squash to 4 cups of water.',
    hint: 'Add the two numbers of the ratio — that tells you the number of equal shares.',
    check: 'If you share 20 sweets in the ratio 2:3, how many does each person get?'
  },

  // ---------------- SOCIAL SCIENCE ----------------
  {
    subject: 'SOCIAL_SCIENCE',
    keywords: ['latitude', 'longitude', 'map', 'maps', 'globe', 'equator'],
    answer:
      'Latitude and longitude are imaginary lines drawn over the Earth so any place can be pinned down exactly.',
    explain: [
      'Latitude lines run east to west, like rings around the Earth. The Equator is the big one in the middle, at 0 degrees.',
      'Longitude lines run north to south, pole to pole. Where one latitude crosses one longitude gives you a single exact spot.'
    ],
    deeper: 'Longitude also sets time zones, because the Earth turns 15 degrees every hour.',
    example: 'It works like a row and column in a seating plan — two numbers, one seat.',
    hint: 'Think about which lines go across the Earth and which go up and down.',
    check: 'Which lines run east to west, and what\'s the main one called?'
  },
  {
    subject: 'SOCIAL_SCIENCE',
    keywords: ['indus valley', 'harappa', 'mohenjo', 'early humans', 'civilisation', 'civilization', 'ancient india'],
    answer:
      'The Indus Valley Civilisation was one of the world\'s earliest city-based societies, around 4,500 years ago in what\'s now Pakistan and north-west India.',
    explain: [
      'Its cities — Harappa and Mohenjo-daro the best known — were planned on a grid, with brick houses, covered drains and public wells. That level of planning is what makes archaeologists take it so seriously.',
      'People there farmed wheat and barley, kept cattle, and traded as far as Mesopotamia. They had a script, but nobody has managed to read it yet.'
    ],
    deeper:
      'Why it declined is still argued over — shifting rivers, climate change and fading trade are the leading explanations, and the honest answer is that we don\'t know for certain.',
    example: 'Their drainage system was better than in many Indian towns 4,000 years later.',
    hint: 'Start with what makes a settlement a city rather than a village.',
    check: 'What does careful town planning tell you about how that society was organised?'
  },
  {
    subject: 'SOCIAL_SCIENCE',
    keywords: ['democracy', 'democratic', 'government', 'election', 'vote', 'panchayat'],
    answer: 'In a democracy the people choose who governs them. Power comes from citizens, not from birth or force.',
    explain: [
      'Citizens vote for representatives, and those representatives make decisions on their behalf.',
      'If people don\'t like those decisions, they can vote differently next time. That accountability is the whole point of the system.'
    ],
    deeper: 'India is a representative democracy, with elected bodies from the village panchayat up to Parliament.',
    example: 'Electing a class monitor by a show of hands is a tiny democracy — everyone gets one vote.',
    hint: 'Compare who holds power in a democracy with who holds it in a kingdom.',
    check: 'So where does a democratic government get its power from?'
  },
  {
    subject: 'SOCIAL_SCIENCE',
    keywords: ['monsoon', 'climate', 'rainfall', 'seasons'],
    answer: 'The monsoon happens because land heats up faster than the sea, and that difference drags in wet ocean air.',
    explain: [
      'In summer the hot air over the land rises, leaving low pressure behind. Cooler, damper air over the ocean rushes in to fill the gap.',
      'That ocean air is carrying a lot of water, and it falls as the heavy monsoon rain.'
    ],
    deeper: 'In winter the pattern reverses — air flows from land to sea — which is why winters are mostly dry.',
    example: 'Same reason a breeze blows off the sea on a hot afternoon at the beach.',
    hint: 'Which heats up faster in summer, the land or the sea?',
    check: 'Why does the summer monsoon wind blow from the sea towards the land?'
  },

  // ---------------- ENGLISH ----------------
  {
    subject: 'ENGLISH',
    keywords: ['noun', 'nouns', 'proper noun', 'common noun'],
    answer: 'A noun is a naming word — a person, place, animal, thing or idea.',
    explain: [
      'A common noun names something general: *city*, *teacher*, *river*. A proper noun names one particular thing and takes a capital letter: *Mumbai*, *Mrs Rao*, *Ganga*.',
      'Quick test: if you can put *the* or *a* in front of it and it still sounds right, it\'s probably a noun.'
    ],
    deeper: 'Nouns for things you can\'t touch, like *honesty* or *freedom*, are called abstract nouns.',
    example: 'In "Aarav read a book in Delhi", the nouns are *Aarav*, *book* and *Delhi*.',
    hint: 'Look for the words that name something.',
    check: 'In "The dog ran across the park", which two words are nouns?'
  },
  {
    subject: 'ENGLISH',
    keywords: ['verb', 'verbs', 'action word'],
    answer: 'A verb tells you what someone does, or what state they\'re in.',
    explain: [
      'Action verbs are the obvious ones: *run*, *write*, *eat*. Being verbs are quieter: *is*, *was*, *seems*.',
      'Every complete sentence needs at least one verb. Without one you\'ve only got a phrase.'
    ],
    deeper: 'Verbs also carry tense, which is how a sentence tells you when something happened.',
    example: 'In "She sings well" the verb is *sings*. In "She is happy" it\'s *is*.',
    hint: 'Ask what the subject of the sentence is doing or being.',
    check: 'What\'s the verb in "The children played in the garden"?'
  },
  {
    subject: 'ENGLISH',
    keywords: ['tense', 'tenses', 'past tense', 'present tense', 'future tense'],
    answer: 'Tense shows when something happens, and it changes the verb.',
    explain: [
      'Present: *I walk to school.* Past: *I walked to school.* Future: *I will walk to school.*',
      'Stick to one tense through a piece of writing unless the time genuinely changes. Switching by accident is the most common mistake in exams.'
    ],
    deeper: 'Each tense has continuous forms too, for actions still going on: *I was walking*, *I am walking*.',
    example: 'Telling a friend about yesterday puts every verb in the past: *went*, *saw*, *ate*.',
    hint: 'Decide first whether it already happened, is happening, or hasn\'t happened yet.',
    check: 'Put "I eat a mango" into the past tense.'
  },
  {
    subject: 'ENGLISH',
    keywords: ['active voice', 'passive voice'],
    answer:
      'In the active voice the subject does the action. In the passive voice the action is done to the subject.',
    explain: [
      'Active: *The boy kicked the ball.* Passive: *The ball was kicked by the boy.* Same event, different focus.',
      'Active is usually shorter and clearer. Passive is handy when you don\'t know, or don\'t need to say, who did it.'
    ],
    deeper: 'To go passive, the object moves to the front and the verb picks up a form of *be*.',
    example: '*Someone stole my bicycle* becomes *My bicycle was stolen* when you don\'t know who did it.',
    hint: 'Find who is doing the action, then see whether they come first or last.',
    check: 'Is "The letter was written by Meera" active or passive?'
  }
];

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;
}

/** Prefers topics in the detected subject so a shared word can't cross subjects. */
function findTopic(question: string, subject: string | null | undefined): MockTopic | null {
  const text = normalise(question);
  let best: MockTopic | null = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    let score = 0;
    for (const keyword of topic.keywords) {
      if (text.includes(` ${keyword} `) || text.includes(` ${keyword}`)) score += 2;
    }
    if (score === 0) continue;
    if (subject && topic.subject === subject) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  return best;
}

/**
 * Handles "7 x 8 = 54?" and "why is 7 x 8 = 56" directly, so ED confirms or
 * corrects real arithmetic instead of talking around it. Deterministic, and the
 * doubling trick is genuinely how you'd show it to a Class 6 student.
 */
function tryArithmetic(question: string): string | null {
  const match = /(\d{1,3})\s*(?:x|×|\*|times)\s*(\d{1,3})\s*(?:=|is|equals)?\s*(\d{1,6})?/i.exec(
    question
  );
  if (!match) return null;

  const a = Number(match[1]);
  const b = Number(match[2]);
  const claimed = match[3] !== undefined ? Number(match[3]) : null;
  const product = a * b;

  const half = Math.floor(b / 2);
  const trick =
    b % 2 === 0
      ? `A quick way to check it:\n\n${a} x ${b} = ${a} x (${half} + ${half}) = ${a * half} + ${a * half} = ${product}`
      : `A quick way to check it:\n\n${a} x ${b} = (${a} x ${b - 1}) + ${a} = ${a * (b - 1)} + ${a} = ${product}`;

  if (claimed === null) {
    return `${a} x ${b} = ${product}.\n\n${trick}`;
  }

  if (claimed === product) {
    return `Yep, that's right — ${a} x ${b} = ${product}.\n\n${trick}`;
  }

  return `Almost — it's ${product}, not ${claimed}.\n\n${a} x ${b} = ${product}.\n\n${trick}`;
}

/** Explains a specific fraction like "what is 3/4" concretely. */
function tryFractionValue(question: string): string | null {
  const match = /(\d{1,3})\s*\/\s*(\d{1,3})/.exec(question);
  if (!match) return null;

  const top = Number(match[1]);
  const bottom = Number(match[2]);
  if (bottom === 0 || top > bottom * 4) return null;

  return `$\\frac{${top}}{${bottom}}$ means you've got ${top} out of ${bottom} equal pieces of something.

The bottom number, ${bottom}, is how many equal pieces the whole was cut into. The top number, ${top}, is how many of those pieces you have.

So if a chocolate bar is split into ${bottom} equal bits and you take ${top} of them, you've taken $\\frac{${top}}{${bottom}}$ of the bar.

Could you draw that as ${bottom} boxes with ${top} of them shaded?`;
}

/**
 * A plea for help with no topic in it ("PLEASE HELP I HAVE A TEST TOMORROW").
 * The useful move is practical: find out what to work on. No sympathy speech,
 * no motivational padding.
 */
function tryStudyRequest(question: string): string | null {
  const text = question.toLowerCase();
  const isPlea = /\b(help|stuck|exam|test|revise|revision|tomorrow)\b/.test(text);
  if (!isPlea) return null;

  return `Right - let's make this useful. Which subject is the test on, and which topic?

Tell me that and we'll start with the part you're least sure about. If you don't know where to start, give me the chapter name and I'll pick.`;
}

/** Class 6 gets the lead plus one paragraph; Class 7/8 get the full explanation. */
function bodyForClass(topic: MockTopic, classLevel: string): string[] {
  if (classLevel === 'CLASS_6') {
    const parts = [topic.explain[0]];
    if (topic.example) parts.push(topic.example);
    return parts;
  }

  const parts = [...topic.explain];
  if (topic.deeper) parts.push(topic.deeper);
  if (classLevel === 'CLASS_7' && topic.example) parts.push(topic.example);
  return parts;
}

function buildTopicReply(topic: MockTopic, classLevel: string, action: string | null): string {
  switch (action) {
    case 'hint':
      return `${topic.hint}\n\nGive it a go — what do you reckon?\n\n${offlineNote()}`;

    case 'quiz_me':
      return `${topic.check}\n\nTake your time. Write what you think and I'll tell you how you did.\n\n${offlineNote()}`;

    case 'real_example':
      return `${topic.example ?? topic.explain[0]}\n\n${topic.check}\n\n${offlineNote()}`;

    case 'simpler':
      return `Shorter version: ${topic.answer}\n\n${
        topic.example ?? topic.explain[0]
      }\n\n${topic.check}\n\n${offlineNote()}`;

    case 'still_confused':
      return `Let me come at it from a different side.\n\n${topic.example ?? topic.hint}\n\n${
        topic.answer
      }\n\n${topic.check}\n\n${offlineNote()}`;

    default:
      return `${topic.answer}

${bodyForClass(topic, classLevel).join('\n\n')}

${topic.check}

${offlineNote()}`;
  }
}

/**
 * No topic matched. Use the student's own words, be honest that the offline stub
 * doesn't know this one, and don't invent facts for a child.
 */
function buildFallbackReply(
  question: string,
  classLabel: string,
  subjectLabel: string | null,
  curriculum?: CurriculumMeta | null
): string {
  const topic = question.replace(/[?.!]+$/, '').trim();

  // When the student asked from inside a curriculum topic, say where they are.
  // This is built from the meta fields rather than being a canned answer to any
  // particular question: the point is to make it visible that curriculum
  // context actually reached the provider.
  // A chapter session has no topic, so topicTitle is null there. Interpolating
  // it produced the literal `You're on "null" in ...` on screen, which is why
  // the two cases are written out rather than sharing one template.
  const book = curriculum?.textbook ? `, from ${curriculum.textbook}` : '';
  const place = !curriculum
    ? ''
    : curriculum.topicTitle
      ? `You're on "${curriculum.topicTitle}" in ${curriculum.chapterTitle}${book}. `
      : `You're starting "${curriculum.chapterTitle}"${book}. `;

  // In development the reply says how to get a real tutor. In production it
  // says only what it can do, which is the same answer without the instruction.
  const lead =
    env.NODE_ENV === 'development'
      ? 'With `OPENROUTER_API_KEY` set I\'d walk you through this properly'
      : "I'd walk you through this properly";
  return `${place}I don't have an offline explanation for "${topic}" ready, so I'd rather not guess at it.

${lead}${
    subjectLabel ? ` as ${subjectLabel} at ${classLabel} level` : ''
  }${curriculum ? (curriculum.topicTitle ? ', using what that topic covers' : ', starting from what that chapter covers') : ''}. Offline, I only carry a handful of common topics.

What part of it is giving you trouble? If you tell me that, I can at least point you at the right idea.

${offlineNote()}`;
}

/**
 * Offline stand-in for a photo turn.
 *
 * Deterministic and clearly offline: it states what it actually received
 * (dimensions are not available here, only the count and type) without
 * pretending to have seen anything. Tests depend on this being stable.
 */
function buildImageReply(params: StreamParams): string {
  const images = params.images ?? [];
  const asked = params.userPrompt.trim();

  return `I can see you sent a photo${images.length > 0 ? ` (${images[0].mimeType.replace('image/', '').toUpperCase()})` : ''}, but I can't actually look at it offline.

With a real connection I'd read what's in it and work through ${asked ? 'your question about it' : 'what it shows'} with you.

${offlineNote()}`;
}

function buildStudyReply(params: StreamParams): string {
  const { userPrompt, meta } = params;

  // A photo turn is answered as a photo turn, whatever the text says.
  if ((params.images?.length ?? 0) > 0) {
    return buildImageReply(params);
  }
  const classLevel = meta?.classLevel ?? 'CLASS_7';
  const subject = meta?.subject ?? null;
  const action = meta?.action ?? null;

  const curriculum = meta?.curriculum ?? null;

  const classLabel = CLASS_LABEL[classLevel] ?? 'Class 7';
  const subjectLabel = subject ? (SUBJECT_LABEL[subject] ?? null) : null;

  // Solvers run first: a concrete sum or fraction beats a general topic.
  if (!action || action === 'simpler') {
    const arithmetic = tryArithmetic(userPrompt);
    if (arithmetic) return `${arithmetic}\n\n${offlineNote()}`;
  }

  const topic = findTopic(userPrompt, subject);

  if (!topic && (!action || action === 'simpler')) {
    const fraction = tryFractionValue(userPrompt);
    if (fraction) return `${fraction}\n\n${offlineNote()}`;
  }

  if (topic) return buildTopicReply(topic, classLevel, action);

  const fraction = tryFractionValue(userPrompt);
  if (fraction) return `${fraction}\n\n${offlineNote()}`;

  // Confusion with nothing concrete attached: ask what specifically, briefly,
  // rather than restating anything.
  if (action === 'still_confused') {
    return `Let's narrow it down instead of me saying the same thing again.

Which bit lost you - the very first step, or somewhere in the middle? Tell me where it stopped making sense and I'll start from there.

${offlineNote()}`;
  }

  const studyRequest = tryStudyRequest(userPrompt);
  if (studyRequest) return `${studyRequest}\n\n${offlineNote()}`;

  return buildFallbackReply(userPrompt.trim().slice(0, 160), classLabel, subjectLabel, curriculum);
}

export class MockAITutorProvider implements IAITutorProvider {
  public readonly name = 'MockAITutorProvider';
  /**
   * True, in the sense that matters here: the Mock accepts a photo turn and
   * answers it honestly ("I can see you sent a photo, but I can't actually
   * look at it offline"). It never pretends to have read one.
   */
  public readonly supportsImages = true;

  public async generateStream(params: StreamParams): Promise<string> {
    const { systemPrompt, onChunk } = params;

    let responseText: string;

    if (systemPrompt.includes('SOCRATIC QUIZ TUTOR')) {
      // In-quiz hints: point at the reasoning, never reveal the answer.
      responseText = `I'm not going to give you the answer, but let's narrow it down.

Read the question once more and work out which single idea it's testing. Then rule out any option that disagrees with something you already know for sure.

What's your first instinct? Tell me and I'll tell you whether the reasoning holds up.

${offlineNote()}`;
    } else {
      responseText = buildStudyReply(params);
    }

    // Sanity net: the offline stub must never emit the filler ED is told to avoid.
    // Trimmed before anything reads or streams it: with no notice to end on, a
    // production reply would otherwise finish with the blank line that used to
    // lead into the notice, and that blank line would be streamed to the student.
    responseText = responseText.trimEnd();
    const lowered = responseText.toLowerCase();
    for (const banned of ED_BANNED_OPENERS) {
      if (lowered.includes(banned)) {
        throw new Error(`MockAITutorProvider produced banned filler: "${banned}"`);
      }
    }

    // Stream in small chunks so the SSE path and client reader are exercised.
    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
      await onChunk(chunk);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    return responseText;
  }

  public async generateStructured<T>(params: StructuredParams<T>): Promise<T> {
    if (params.fallbackGenerator) {
      return params.fallbackGenerator();
    }
    throw new Error('Mock structured generation requires a fallback generator');
  }
}
