/**
 * Turning ED's written answer into something worth hearing.
 *
 * Split the way lib/theme.ts is split: everything here is a pure function, so
 * the parts that are easy to get wrong - what the student actually hears - can
 * be tested without a browser or a speech engine. The provider that owns the
 * one `speechSynthesis` object is in context/speech-context.tsx.
 *
 * The problem this solves: ED is instructed to answer in Markdown with LaTeX
 * for maths. Handed to a speech engine raw, a student hears "star star bold
 * star star" and "backslash frac open brace 3 close brace open brace 4 close
 * brace". For a child who wants the answer read to them, that is worse than
 * silence.
 */

/** Playback state, which is also what the button renders from. */
export type SpeechState = 'idle' | 'speaking' | 'paused';

/** What can happen to playback. `end` and `error` both come from the engine. */
export type SpeechAction = 'play' | 'pause' | 'resume' | 'stop' | 'end' | 'error';

/**
 * The playback state machine.
 *
 * A reducer rather than a handful of setState calls because the awkward cases
 * are all transitions: a second click while paused, an `end` event arriving
 * after the student already pressed stop, an error part way through. Those are
 * cheap to assert here and expensive to chase in a browser.
 *
 * Unknown transitions deliberately return the current state rather than
 * throwing: a late event from the engine must never break text tutoring.
 */
export function nextSpeechState(current: SpeechState, action: SpeechAction): SpeechState {
  switch (action) {
    case 'play':
      // Playing while something is already playing restarts: the provider
      // cancels the previous utterance first, so there is never an overlap.
      return 'speaking';
    case 'pause':
      return current === 'speaking' ? 'paused' : current;
    case 'resume':
      return current === 'paused' ? 'speaking' : current;
    case 'stop':
    case 'end':
    case 'error':
      return 'idle';
    default:
      return current;
  }
}

/** True when this browser can speak at all. Safe to call during SSR. */
export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  // Checked by key rather than through the Window type: lib.dom declares
  // SpeechSynthesisUtterance as a global, not as a Window property, so the
  // property form does not typecheck even though it is how the API is reached
  // at runtime.
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** Greek and symbol names a Class 6-8 student would actually meet. */
const SYMBOL_WORDS: Record<string, string> = {
  pi: 'pi',
  theta: 'theta',
  alpha: 'alpha',
  beta: 'beta',
  gamma: 'gamma',
  delta: 'delta',
  lambda: 'lambda',
  mu: 'mu',
  omega: 'omega',
  times: ' times ',
  cdot: ' times ',
  div: ' divided by ',
  pm: ' plus or minus ',
  leq: ' is less than or equal to ',
  le: ' is less than or equal to ',
  geq: ' is greater than or equal to ',
  ge: ' is greater than or equal to ',
  neq: ' is not equal to ',
  ne: ' is not equal to ',
  approx: ' is roughly ',
  infty: 'infinity',
  degree: ' degrees ',
  circ: ' degrees '
};

/** Exponents worth a word of their own. */
const POWER_WORDS: Record<string, string> = {
  '2': ' squared ',
  '3': ' cubed '
};

/**
 * Reads one stretch of LaTeX aloud.
 *
 * Applied ONLY inside maths delimiters. That separation is the whole trick:
 * run these replacements over prose and "well-known" becomes "well minus
 * known", and every hyphenated word in the answer is mangled.
 */
function verbaliseMath(latex: string): string {
  let out = latex;

  // Arrows inside maths mean "tends to" or "maps to". They must be handled
  // before the operator rules below, or the '-' and '>' of an arrow are spoken
  // as "minus" and "is greater than" in turn.
  out = out.replace(
    /\s*(?:→|⟶|->|=>|\\to(?![a-zA-Z])|\\rightarrow(?![a-zA-Z])|\\longrightarrow(?![a-zA-Z]))\s*/g,
    ' tends to '
  );

  // \frac{3}{4} -> 3 over 4. Runs repeatedly so a nested fraction resolves.
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(
      /\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_m, top: string, bottom: string) => ` ${top} over ${bottom} `
    );
    if (next === out) break;
    out = next;
  }

  // \sqrt{x} and \sqrt[3]{x}
  out = out.replace(
    /\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g,
    (_m, root: string, body: string) => ` the ${root} root of ${body} `
  );
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, body: string) => ` the square root of ${body} `);

  // Degrees, before the generic power rule eats the superscript.
  out = out.replace(/\^\s*\{?\s*\\circ\s*\}?/g, ' degrees ');

  // Powers: x^2 -> x squared, x^{10} -> x to the power of 10.
  out = out.replace(/\^\s*\{([^{}]*)\}/g, (_m, exp: string) => POWER_WORDS[exp.trim()] ?? ` to the power of ${exp} `);
  out = out.replace(/\^\s*(-?\w)/g, (_m, exp: string) => POWER_WORDS[exp.trim()] ?? ` to the power of ${exp} `);

  // Subscripts read as plain digits: H_2O is "H 2 O", which is how a teacher
  // says it. "H subscript 2" is technically right and useless out loud.
  out = out.replace(/_\s*\{([^{}]*)\}/g, (_m, sub: string) => ` ${sub} `);
  out = out.replace(/_\s*(\w)/g, (_m, sub: string) => ` ${sub} `);

  // Named symbols and operators.
  out = out.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => {
    const word = SYMBOL_WORDS[name];
    return word !== undefined ? word : ' ';
  });

  // Bare operators, now that we know we are inside maths.
  out = out
    .replace(/\s*=\s*/g, ' equals ')
    .replace(/\s*\+\s*/g, ' plus ')
    .replace(/\s*[-−]\s*/g, ' minus ')
    .replace(/\s*\/\s*/g, ' over ')
    .replace(/\s*<\s*/g, ' is less than ')
    .replace(/\s*>\s*/g, ' is greater than ');

  // Leftover TeX punctuation nobody should hear.
  out = out.replace(/[{}$\\&]/g, ' ').replace(/\s*,\s*/g, ', ');

  return out;
}

/**
 * Adds a full stop unless the line already closes itself.
 *
 * Used for headings and list items, which authors never punctuate and which a
 * speech engine therefore runs straight into the next line.
 */
function endWithStop(line: string): string {
  const trimmed = line.trim();
  if (trimmed === '') return '';
  return /[.!?:;,]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Arrows that mean "and then comes": a sequence, a path, a life cycle. */
const SEQUENCE_ARROW = /\s*(?:→|⟶|➔|➜|⇨|->|=>)\s*/;
const ANY_SEQUENCE_ARROW = /→|⟶|➔|➜|⇨|->|=>/;

/**
 * Turns one line that uses arrows into the sentence a teacher would say.
 *
 * "egg → larva → pupa → adult" is spoken as "egg, then larva, then pupa, and
 * finally adult." The words added are only connectors. Every item is the
 * author's own and stays in the author's order, so no fact is introduced. The
 * alternative is the engine saying "right arrow" or "minus greater than",
 * which means nothing to a child.
 *
 * A label ending in a colon ("Stages: egg → ...") is joined to the first item
 * with a space, not a comma, so it never reads "Stages:,".
 *
 * "⇒" and "⟹" are not sequences. They mean "implies", so they become that word.
 */
function speakArrowLine(line: string): string {
  const text = line.replace(/\s*(?:⇒|⟹)\s*/g, ' implies ');
  if (!ANY_SEQUENCE_ARROW.test(text)) return text;

  const items = text
    .split(SEQUENCE_ARROW)
    .map((item) => item.trim())
    .filter((item) => item !== '');
  while (items.length > 1 && items[0].endsWith(':')) {
    items.splice(0, 2, `${items[0]} ${items[1]}`);
  }
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];

  let spoken = items[0];
  const last = items.length - 1;
  for (let i = 1; i <= last; i += 1) {
    if (i === 1 && last === 1) spoken += ', and then ';
    else if (i === last) spoken += ', and finally ';
    else spoken += ', then ';
    spoken += items[i];
  }
  return endWithStop(spoken);
}

/**
 * Strips Markdown so the words survive and the syntax does not.
 *
 * Order matters: fenced code goes before inline code, images before links,
 * and emphasis after links so a bolded link keeps its text.
 */
function stripMarkdown(markdown: string): string {
  let out = markdown;

  // Fenced code is dropped outright. Reading a code block aloud to a child
  // helps nobody, and ED is told to use prose anyway.
  out = out.replace(/```[\s\S]*?```/g, ' ');
  out = out.replace(/~~~[\s\S]*?~~~/g, ' ');

  // Images carry no spoken content; their alt text is decoration here.
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');

  // Links keep the words, never the URL. A read-aloud "h t t p s colon slash
  // slash" is the single worst thing a speech feature can do.
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Inline code keeps its text: it is usually a term, not a snippet.
  out = out.replace(/`([^`]*)`/g, '$1');

  // Headings, blockquotes, list markers, rules.
  //
  // Headings and list items get a full stop when they do not already end in
  // punctuation. This is the pacing fix, not cosmetics: a single newline
  // collapses to a space further down, so "How shadows work" followed by its
  // paragraph used to be read as one breathless run-on, and a bullet list
  // came out as "It gets longer It gets shorter". A speech engine pauses on
  // punctuation and on nothing else.
  out = out.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, (_m, heading: string) => endWithStop(heading));
  out = out.replace(/^\s{0,3}>\s?/gm, '');
  out = out.replace(/^\s{0,3}[-*+]\s+(.*)$/gm, (_m, item: string) => endWithStop(item));
  out = out.replace(
    /^\s{0,3}(\d+[.)])\s+(.*)$/gm,
    (_m, marker: string, item: string) => `${marker} ${endWithStop(item)}`
  );
  out = out.replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, ' ');

  // Emphasis and strikethrough.
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/~~([^~]+)~~/g, '$1');
  // A single underscore pair, only when it wraps whole words, so snake_case
  // terms survive intact.
  out = out.replace(/(^|\s)_([^_]+)_(?=\s|$|[.,!?])/g, '$1$2');

  // Table pipes become pauses rather than "pipe pipe pipe".
  out = out.replace(/^\s*\|?[\s:|-]+\|\s*$/gm, ' ');
  out = out.replace(/\s*\|\s*/g, ', ');

  return out;
}

/**
 * The text a speech engine should receive for one ED answer.
 *
 * Takes only the student-visible reply. Nothing else is in scope: the system
 * prompt, the curriculum context, the teaching brief and every other
 * instruction live on the server and are never sent to the client, so there is
 * nothing here that could leak them even by accident.
 *
 * Returns '' when there is nothing worth speaking, which is how the button
 * knows to stay disabled.
 */
export function speakableText(markdown: string | null | undefined): string {
  if (!markdown) return '';

  // Maths is pulled out first and verbalised on its own, so the operator
  // rules never touch prose. $$display$$ before $inline$.
  let out = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (_m, body: string) => ` ${verbaliseMath(body)} `);
  out = out.replace(/\$([^$\n]*?)\$/g, (_m, body: string) => ` ${verbaliseMath(body)} `);
  // Models emit \( \) and \[ \] about as often as dollars - the same
  // normalisation MarkdownMessage does before rendering.
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, body: string) => ` ${verbaliseMath(body)} `);
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, body: string) => ` ${verbaliseMath(body)} `);

  out = stripMarkdown(out);
  out = out.split('\n').map(speakArrowLine).join('\n');

  // Collapse the whitespace all of the above leaves behind, but keep sentence
  // breaks: a speech engine pauses on punctuation, not on newlines.
  out = out
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*\n\s*/g, '. ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.!?])\s*\.\s/g, '$1 ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // A guard, not a tidy-up. The sentence-break rule above turns a reply that
  // was only blank lines into ".", which would show an enabled button and
  // ask the engine to speak a full stop. Anything with no letter or digit
  // left in it has nothing to say.
  if (!/[a-zA-Z0-9]/.test(out)) return '';

  return out;
}

/**
 * The subset of SpeechSynthesisVoice this module needs.
 *
 * Declared structurally so voice selection can be tested with plain objects -
 * there is no SpeechSynthesisVoice constructor to build one with, and the set
 * of installed voices differs on every device.
 */
export interface VoiceLike {
  name: string;
  lang: string;
  /** False for a cloud voice, which on most platforms is the better one. */
  localService?: boolean;
  default?: boolean;
}

/**
 * Names that indicate a modern, better-sounding engine.
 *
 * Matched as substrings rather than exact names on purpose: the installed set
 * differs per OS, per browser and per version, so naming a specific voice
 * would pick something that does not exist on most devices. These are the
 * words the platforms actually use - "Microsoft Aria Online (Natural)",
 * "Google UK English", "Samantha (Enhanced)", Google Cloud's WaveNet/Studio.
 */
const QUALITY_MARKERS = ['natural', 'neural', 'enhanced', 'premium', 'wavenet', 'studio', 'online'];

/** Names that indicate an old formant synthesiser - the robotic ones. */
const LOW_QUALITY_MARKERS = ['espeak', 'compact', 'eloquence', 'pico'];

/** English locales in order of fit for this product. */
const LANG_PREFERENCE = ['en-in', 'en-gb', 'en-au', 'en-us'];

/**
 * A voice a student has chosen by name, preferred whenever the device has it.
 *
 * Checked before any scoring, because a choice someone made on purpose should
 * not be second-guessed by a heuristic. Exact and case-sensitive: it matches
 * the name the browser reports, and a near-miss is a different voice. Absent
 * on another device, selection falls through to the normal scoring unchanged.
 */
export const PREFERRED_VOICE_NAME = 'Google UK English Female';

/**
 * Picks the best available English voice, or null if there is none.
 *
 * Null is a real outcome and must stay one: on a device with no English voice
 * installed, letting the engine fall back to, say, a Hindi voice reading
 * English text is worse than leaving the default alone.
 *
 * Nothing here is a quality guarantee. It is a preference order over whatever
 * the device happens to have, which is the most any client-side synthesiser
 * can offer.
 */
export function pickVoice(voices: VoiceLike[] | null | undefined): VoiceLike | null {
  if (!voices || voices.length === 0) return null;

  const english = voices.filter(
    (voice) => typeof voice?.lang === 'string' && voice.lang.toLowerCase().startsWith('en')
  );
  if (english.length === 0) return null;

  const preferred = english.find((voice) => voice.name === PREFERRED_VOICE_NAME);
  if (preferred) return preferred;

  let best: VoiceLike | null = null;
  let bestScore = -Infinity;

  for (const voice of english) {
    const name = (voice.name ?? '').toLowerCase();
    const lang = voice.lang.toLowerCase().replace('_', '-');
    let score = 0;

    if (QUALITY_MARKERS.some((marker) => name.includes(marker))) score += 40;
    if (LOW_QUALITY_MARKERS.some((marker) => name.includes(marker))) score -= 40;

    const langIndex = LANG_PREFERENCE.indexOf(lang);
    score += langIndex === -1 ? 2 : (LANG_PREFERENCE.length - langIndex) * 6;

    // A cloud voice is usually the better-sounding one.
    if (voice.localService === false) score += 5;
    if (voice.default) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return best;
}

/** Whether a voice's name suggests a modern engine. Drives pacing only. */
export function isHighQualityVoice(voice: VoiceLike | null): boolean {
  if (!voice) return false;
  const name = (voice.name ?? '').toLowerCase();
  if (LOW_QUALITY_MARKERS.some((marker) => name.includes(marker))) return false;
  return QUALITY_MARKERS.some((marker) => name.includes(marker));
}

/**
 * Speaking rate for a voice.
 *
 * A modern voice is clear at normal pace; an older formant one is easier to
 * follow very slightly slowed. Both stay close to 1 - dropping the rate far
 * enough to "sound careful" just sounds broken, and pitch is deliberately
 * left at 1 throughout, because moving it is what produces the cartoon voice.
 */
export function speechRateFor(voice: VoiceLike | null): number {
  return isHighQualityVoice(voice) ? 1 : 0.92;
}

/** Label for the control, so the button and its aria-label cannot disagree. */
export function speechButtonLabel(state: SpeechState): string {
  if (state === 'speaking') return 'Pause reading';
  if (state === 'paused') return 'Resume reading';
  return 'Read this answer aloud';
}

/* ------------------------------------------------------------------------- *
 * Speech INPUT - the student talking to ED.
 *
 * A separate concern from playback above, kept in the same module because the
 * pure parts belong together and neither needs a DOM. The browser side lives
 * in lib/use-speech-input.ts.
 *
 * IMPORTANT, and stated here because it is easy to get wrong in the UI copy:
 * this is NOT offline. The Web Speech API's recognition is implemented by the
 * browser, and in Chrome and Edge that means the audio is sent to the
 * vendor's own speech service. There is no local recognition to fall back on,
 * so the feature needs a connection and the student's words leave the device.
 * ------------------------------------------------------------------------- */

/** Where push-to-talk is right now. */
export type ListenState = 'idle' | 'listening' | 'processing' | 'error';

/** What can happen to it. `settled` is the engine's own end event. */
export type ListenAction = 'start' | 'stop' | 'settled' | 'error' | 'dismiss';

/**
 * Push-to-talk state machine.
 *
 * `processing` is the gap between the student releasing the button and the
 * engine delivering its last result - short, but long enough that without a
 * state for it the button flickers back to idle and then shows a transcript
 * arriving from nowhere.
 *
 * Unknown transitions return the current state. Recognition engines fire
 * duplicate and late events freely, and none of them may wedge the composer.
 */
export function nextListenState(current: ListenState, action: ListenAction): ListenState {
  switch (action) {
    case 'start':
      return 'listening';
    case 'stop':
      return current === 'listening' ? 'processing' : current;
    case 'settled':
      // An error already told the student something useful; a late `end`
      // event must not wipe it.
      return current === 'error' ? 'error' : 'idle';
    case 'error':
      return 'error';
    case 'dismiss':
      return current === 'error' ? 'idle' : current;
    default:
      return current;
  }
}

/** True when this browser can listen at all. Safe during SSR. */
export function isRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * What to tell a child when recognition fails.
 *
 * Every branch ends by pointing at typing, because that is the fallback that
 * always works. `aborted` returns '' deliberately: the student cancelled, and
 * showing them an error for doing what they meant to do is noise.
 */
export function recognitionErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in your browser settings, or type your question instead.';
    case 'audio-capture':
      return "I can't find a microphone on this device. You can type your question instead.";
    case 'no-speech':
      return "I didn't hear anything. Tap the mic and try again, or type your question.";
    case 'network':
      return 'Speech needs an internet connection to work and could not reach it. Type your question instead.';
    case 'language-not-supported':
      return 'This browser cannot listen in English here. Type your question instead.';
    case 'aborted':
      return '';
    default:
      return "Speech input didn't work this time. Type your question instead.";
  }
}

/**
 * Folds a recognised phrase into whatever is already in the composer.
 *
 * Appends rather than replaces, so a student can type half a question, speak
 * the rest, and keep both - and so a second press of the mic adds to the
 * first result instead of destroying it.
 */
export function mergeTranscript(existing: string, transcript: string): string {
  const addition = transcript.trim().replace(/\s+/g, ' ');
  if (addition === '') return existing;

  const current = existing.trimEnd();
  if (current === '') return addition;
  // No double space, and no space before punctuation the engine may emit.
  return /[.,!?;:]$/.test(addition) || /[.,!?;:]/.test(addition.charAt(0))
    ? `${current}${addition}`
    : `${current} ${addition}`;
}

/** Label for the mic control, kept beside the state it renders from. */
export function listenButtonLabel(state: ListenState, supported: boolean): string {
  if (!supported) return 'Speech input is not available in this browser';
  if (state === 'listening') return 'Stop listening';
  if (state === 'processing') return 'Finishing up';
  return 'Ask by speaking';
}
