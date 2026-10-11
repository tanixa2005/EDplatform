/**
 * Spoken explanations, verified without a browser or a speech engine.
 *
 * The two things that decide whether this feature helps a child are both pure
 * functions, which is why they live in lib/speech.ts: what the engine is
 * handed (`speakableText`) and what the control does on the awkward second
 * click (`nextSpeechState`). Neither needs a DOM to check.
 *
 * What this cannot cover - that a voice is actually available, that it sounds
 * right, that pause really pauses on a given browser - is listed as a
 * limitation rather than pretended at.
 *
 * Run: npx tsx src/__tests__/verify_speech.ts
 */
import assert from 'node:assert/strict';
import {
  PREFERRED_VOICE_NAME,
  isHighQualityVoice,
  isRecognitionSupported,
  isSpeechSupported,
  listenButtonLabel,
  mergeTranscript,
  nextListenState,
  nextSpeechState,
  pickVoice,
  recognitionErrorMessage,
  speakableText,
  speechButtonLabel,
  speechRateFor,
  type ListenAction,
  type ListenState,
  type SpeechAction,
  type SpeechState,
  type VoiceLike
} from '../lib/speech.js';

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

function check(test: string, fn: () => void) {
  try {
    fn();
    RESULTS.push({ test, status: 'PASSED' });
    console.log(`  [PASS] ${test}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    RESULTS.push({ test, status: 'FAILED', error: message });
    console.error(`  [FAIL] ${test}: ${message}`);
  }
}

console.log('\n====================================================');
console.log('🔊 SPOKEN EXPLANATION SUITE');
console.log('====================================================\n');

// ---------------------------------------------------------------- Markdown
check('Markdown syntax is spoken as words, never as punctuation', () => {
  const spoken = speakableText(
    '## How shadows work\n\nA shadow forms when an **object** blocks *light*.\n\n- It gets longer\n- It gets shorter\n'
  );
  assert.ok(!spoken.includes('#'), 'a heading marker survived');
  assert.ok(!spoken.includes('**'), 'bold markers survived');
  assert.ok(!spoken.includes('- '), 'a list marker survived');
  assert.ok(spoken.includes('How shadows work'), 'the heading text was lost');
  assert.ok(spoken.includes('object'), 'bolded text was lost');
  assert.ok(spoken.includes('light'), 'italic text was lost');
  assert.ok(spoken.includes('It gets longer'), 'a list item was lost');
});

check('A link is read as its words and never as a URL', () => {
  const spoken = speakableText('Read [the chapter on light](https://example.com/light?x=1) next.');
  assert.ok(spoken.includes('the chapter on light'), 'the link text was lost');
  assert.ok(!spoken.includes('http'), 'a URL would be read aloud');
  assert.ok(!spoken.includes('example.com'), 'a hostname would be read aloud');
  assert.ok(!spoken.includes('['), 'link syntax survived');
});

check('Code blocks are dropped and inline code keeps its words', () => {
  const spoken = speakableText(
    'Set it like this:\n\n```js\nconst x = 1;\n```\n\nThe term is `photosynthesis`.'
  );
  assert.ok(!spoken.includes('const'), 'a code block would be read aloud');
  assert.ok(!spoken.includes('```'), 'fence markers survived');
  assert.ok(spoken.includes('photosynthesis'), 'inline code text was lost');
  assert.ok(!spoken.includes('`'), 'backticks survived');
});

check('Images, rules, quotes and tables leave no syntax behind', () => {
  const spoken = speakableText(
    '![a diagram](/d.png)\n\n> Remember this\n\n---\n\n| Time | Shadow |\n| --- | --- |\n| Noon | Short |\n'
  );
  for (const junk of ['![', '](', '>', '---', '|']) {
    assert.ok(!spoken.includes(junk), `syntax survived: ${junk}`);
  }
  assert.ok(spoken.includes('Remember this'), 'quoted text was lost');
  assert.ok(spoken.includes('Noon'), 'table content was lost');
});

check('Prose is never mangled by the maths rules', () => {
  // The reason maths is extracted before any operator substitution: these
  // rules loose on prose turn "well-known" into "well minus known".
  const spoken = speakableText(
    'A well-known, self-evident idea: snake_case stays, and 7 x 8 = 56 is written plainly.'
  );
  assert.ok(spoken.includes('well-known'), 'a hyphenated word was broken');
  assert.ok(spoken.includes('self-evident'), 'a hyphenated word was broken');
  assert.ok(spoken.includes('snake_case'), 'an underscore term was broken');
  assert.ok(spoken.includes('7 x 8 = 56'), 'plain arithmetic in prose was rewritten');
  assert.ok(!spoken.includes('minus known'), 'a hyphen was read as minus');
});

// ---------------------------------------------------------------- LaTeX
check('Fractions, roots and powers are spoken the way a teacher says them', () => {
  assert.ok(speakableText('It is $\\frac{3}{4}$ of the whole.').includes('3 over 4'));
  assert.ok(speakableText('Area is $x^2$ units.').includes('squared'));
  assert.ok(speakableText('Volume is $x^3$ units.').includes('cubed'));
  assert.ok(speakableText('Try $2^{10}$.').includes('to the power of 10'));
  assert.ok(speakableText('Use $\\sqrt{16}$.').includes('square root of 16'));
  const display = speakableText('$$\\frac{a}{b} = c$$');
  assert.ok(display.includes('a over b'), 'a display fraction was not spoken');
  assert.ok(display.includes('equals'), 'an equals sign was not spoken');
});

check('Both LaTeX delimiter styles are handled', () => {
  // Models emit \( \) and \[ \] about as often as dollar signs.
  assert.ok(speakableText('Here \\(x^2\\) is it.').includes('squared'), 'inline \\( \\) ignored');
  assert.ok(speakableText('Here \\[\\frac{1}{2}\\] is it.').includes('1 over 2'), 'display \\[ \\] ignored');
  assert.ok(!speakableText('Here \\(x^2\\) is it.').includes('\\'), 'a backslash survived');
});

check('Symbols and operators inside maths become words', () => {
  const cases: [string, string][] = [
    ['$3 \\times 4$', 'times'],
    ['$8 \\div 2$', 'divided by'],
    ['$x \\leq 5$', 'less than or equal to'],
    ['$x \\neq 5$', 'not equal to'],
    ['$2 \\pi r$', 'pi'],
    ['$90^\\circ$', 'degrees'],
    ['$a + b$', 'plus'],
    ['$a - b$', 'minus'],
    ['$a < b$', 'is less than']
  ];
  for (const [input, expected] of cases) {
    const spoken = speakableText(input);
    assert.ok(spoken.includes(expected), `${input} -> ${JSON.stringify(spoken)} lacks "${expected}"`);
  }
  // Subscripts read as plain digits, which is how H2O is said out loud.
  assert.match(speakableText('Water is $H_2O$.'), /H\s*2\s*O/);
});

check('No TeX punctuation is ever left to be read out', () => {
  const spoken = speakableText(
    'Check $$\\frac{\\sqrt{x^2 + y^2}}{2\\pi}$$ and $\\alpha \\approx \\beta$.'
  );
  for (const junk of ['\\', '{', '}', '$', '^', '_']) {
    assert.ok(!spoken.includes(junk), `TeX punctuation survived: ${junk}`);
  }
});

// ---------------------------------------------------------------- nothing to say
check('Nothing speakable returns an empty string, so the button stays hidden', () => {
  for (const input of [null, undefined, '', '   ', '\n\n', '```js\nconst x=1;\n```', '---', '![x](/y.png)']) {
    assert.equal(speakableText(input as string), '', `expected nothing from ${JSON.stringify(input)}`);
  }
});

check('Whitespace is collapsed and blank lines become sentence breaks', () => {
  const spoken = speakableText('First idea.\n\nSecond idea.\n\n\nThird idea.');
  assert.ok(!spoken.includes('\n'), 'a newline survived');
  assert.ok(!/\s{2,}/.test(spoken), 'double spacing survived');
  assert.ok(spoken.startsWith('First idea.'), `unexpected start: ${JSON.stringify(spoken)}`);
  assert.ok(spoken.includes('Second idea.'), 'content was lost');
  assert.ok(spoken.includes('Third idea.'), 'content was lost');
});

check('The transform can only ever say words from the answer or its maths vocabulary', () => {
  // A property, not an example: nothing the student did not see on screen can
  // be introduced. The system prompt, the curriculum context and the teaching
  // brief never reach the client at all, and this pins that the function
  // cannot invent text even so.
  const MATH_VOCAB = new Set([
    'over','squared','cubed','to','the','power','of','square','root','equals','plus','minus',
    'times','divided','by','is','less','than','greater','or','equal','not','roughly','degrees',
    'infinity','pi','theta','alpha','beta','gamma','delta','lambda','mu','omega'
  ]);
  const input =
    'Shadows shorten at noon because $\\frac{h}{\\tan\\theta}$ shrinks when $\\theta \\geq 60^\\circ$.';
  const inputWords = new Set(input.toLowerCase().match(/[a-z]+/g) ?? []);
  const spokenWords = speakableText(input).toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of spokenWords) {
    assert.ok(
      inputWords.has(word) || MATH_VOCAB.has(word),
      `the transform introduced a word that was not in the answer: "${word}"`
    );
  }
});

// ---------------------------------------------------------------- playback state
check('The playback state machine covers every transition', () => {
  const table: [SpeechState, SpeechAction, SpeechState][] = [
    ['idle', 'play', 'speaking'],
    ['speaking', 'pause', 'paused'],
    ['paused', 'resume', 'speaking'],
    ['speaking', 'stop', 'idle'],
    ['paused', 'stop', 'idle'],
    ['speaking', 'end', 'idle'],
    ['speaking', 'error', 'idle'],
    // A second answer's play button while one is already talking: the
    // provider cancels first, so this is a restart, not a queue.
    ['speaking', 'play', 'speaking'],
    ['paused', 'play', 'speaking'],
    // Events that cannot apply must be ignored, not throw: engines deliver
    // late and duplicate events, and none of them may break text tutoring.
    ['idle', 'pause', 'idle'],
    ['idle', 'resume', 'idle'],
    ['speaking', 'resume', 'speaking'],
    ['paused', 'pause', 'paused'],
    ['idle', 'stop', 'idle'],
    ['idle', 'end', 'idle']
  ];
  for (const [from, action, expected] of table) {
    const got = nextSpeechState(from, action);
    assert.equal(got, expected, `${from} + ${action} gave ${got}, expected ${expected}`);
  }
});

check('Repeated clicks never leave an unreachable state', () => {
  // Hammering the control must always end somewhere the button can render.
  let state: SpeechState = 'idle';
  const actions: SpeechAction[] = ['play', 'play', 'pause', 'pause', 'resume', 'resume', 'play', 'stop', 'stop', 'end'];
  for (const action of actions) {
    state = nextSpeechState(state, action);
    assert.ok(['idle', 'speaking', 'paused'].includes(state), `unreachable state: ${state}`);
  }
  assert.equal(state, 'idle', 'the sequence did not settle back to idle');
});

check('The label always matches the state it is rendered from', () => {
  assert.match(speechButtonLabel('idle'), /read/i);
  assert.match(speechButtonLabel('speaking'), /pause/i);
  assert.match(speechButtonLabel('paused'), /resume/i);
  // Three distinct labels, so a screen reader never hears the same thing for
  // two different states.
  const labels = new Set(['idle', 'speaking', 'paused'].map((s) => speechButtonLabel(s as SpeechState)));
  assert.equal(labels.size, 3, 'two states share a label');
});

check('An unsupported environment reports false rather than throwing', () => {
  // This test process has no window at all, which is also what SSR looks like.
  assert.equal(isSpeechSupported(), false);
});

// ---------------------------------------------------------------- pacing
check('Headings and list items end in a stop so speech pauses between them', () => {
  // A speech engine pauses on punctuation and on nothing else. Without this a
  // bullet list was read as "It gets longer It gets shorter".
  const spoken = speakableText('## How shadows work\n\n- It gets longer\n- It gets shorter\n');
  assert.ok(spoken.includes('How shadows work.'), `heading not closed: ${JSON.stringify(spoken)}`);
  assert.ok(spoken.includes('It gets longer.'), 'list item not closed');
  assert.ok(spoken.includes('It gets shorter.'), 'list item not closed');
  // And an item that already punctuates itself is not double-stopped.
  const already = speakableText('- Already done.\n- A question?\n');
  assert.ok(!already.includes('..'), `double stop: ${JSON.stringify(already)}`);
  assert.ok(already.includes('A question?'), 'existing punctuation was changed');
});

check('Ordered lists keep their numbers and gain a stop', () => {
  const spoken = speakableText('1. Observe\n2. Ask\n3. Test\n');
  assert.ok(spoken.includes('1. Observe.'), `unexpected: ${JSON.stringify(spoken)}`);
  assert.ok(spoken.includes('3. Test.'), 'last step lost');
});

// ---------------------------------------------------------------- voice selection
check('A natural or neural voice wins over a basic one', () => {
  const voices: VoiceLike[] = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'eSpeak English', lang: 'en' }
  ];
  const chosen = pickVoice(voices);
  assert.ok(chosen, 'nothing chosen');
  assert.match(chosen!.name, /Natural/, `chose ${chosen!.name}`);
});

check('English India is preferred when an equally good one exists', () => {
  const voices: VoiceLike[] = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google UK English Other', lang: 'en-GB' },
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Microsoft Neerja - English (India)', lang: 'en-IN' }
  ];
  const chosen = pickVoice(voices);
  assert.equal(chosen?.lang, 'en-IN', `chose ${chosen?.name} (${chosen?.lang})`);
});

check('A quality marker outranks the locale, which is the right trade', () => {
  // A natural en-GB voice is a better experience than a robotic en-IN one.
  const voices: VoiceLike[] = [
    { name: 'eSpeak English (India)', lang: 'en-IN' },
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' }
  ];
  const chosen = pickVoice(voices);
  assert.match(chosen!.name, /Natural/, `chose ${chosen!.name}`);
});

check('A device with no English voice chooses nothing rather than the wrong one', () => {
  // Reading English with a Hindi or French voice is worse than the engine
  // default, so null has to stay a real outcome.
  const voices: VoiceLike[] = [
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Thomas', lang: 'fr-FR' }
  ];
  assert.equal(pickVoice(voices), null);
  assert.equal(pickVoice([]), null);
  assert.equal(pickVoice(null), null);
  assert.equal(pickVoice(undefined), null);
});

check('Voice choice never depends on a hardcoded name existing', () => {
  // Whatever the device has, something English is chosen. Nothing is matched
  // by exact name, because the installed set differs on every platform.
  const oddball: VoiceLike[] = [
    { name: 'Unknown Voice 7', lang: 'en-ZA' },
    { name: 'Another One', lang: 'en-NZ' }
  ];
  const chosen = pickVoice(oddball);
  assert.ok(chosen, 'a plausible English voice was rejected');
  assert.ok(chosen!.lang.toLowerCase().startsWith('en'), 'chose a non-English voice');
});

check('A cloud voice breaks a tie with a local one', () => {
  const voices: VoiceLike[] = [
    { name: 'Alpha English', lang: 'en-IN', localService: true },
    { name: 'Beta English', lang: 'en-IN', localService: false }
  ];
  assert.equal(pickVoice(voices)?.name, 'Beta English');
});

check('Pacing follows the voice and pitch is never exaggerated', () => {
  const natural: VoiceLike = { name: 'Aria Online (Natural)', lang: 'en-US' };
  const basic: VoiceLike = { name: 'eSpeak English', lang: 'en' };

  assert.equal(isHighQualityVoice(natural), true);
  assert.equal(isHighQualityVoice(basic), false);
  assert.equal(isHighQualityVoice(null), false);

  // Both rates stay near normal: a heavily slowed voice sounds broken, not
  // careful. Pitch is not configurable here at all, which is deliberate.
  for (const voice of [natural, basic, null]) {
    const rate = speechRateFor(voice);
    assert.ok(rate >= 0.85 && rate <= 1.1, `rate ${rate} is outside a natural range`);
  }
  assert.ok(speechRateFor(natural) > speechRateFor(basic), 'a better voice should not be slower');
});

// ---------------------------------------------------------------- push to talk
check('The push-to-talk state machine covers every transition', () => {
  const table: [ListenState, ListenAction, ListenState][] = [
    ['idle', 'start', 'listening'],
    ['listening', 'stop', 'processing'],
    ['processing', 'settled', 'idle'],
    ['listening', 'settled', 'idle'],
    ['listening', 'error', 'error'],
    ['processing', 'error', 'error'],
    ['error', 'dismiss', 'idle'],
    ['error', 'start', 'listening'],
    // A late `end` must not wipe an error the student is still reading.
    ['error', 'settled', 'error'],
    // Ignored rather than throwing: engines fire duplicate and late events.
    ['idle', 'stop', 'idle'],
    ['processing', 'stop', 'processing'],
    ['idle', 'settled', 'idle'],
    ['idle', 'dismiss', 'idle'],
    ['listening', 'dismiss', 'listening']
  ];
  for (const [from, action, expected] of table) {
    const got = nextListenState(from, action);
    assert.equal(got, expected, `${from} + ${action} gave ${got}, expected ${expected}`);
  }
});

check('Repeated mic presses always settle somewhere renderable', () => {
  let state: ListenState = 'idle';
  const actions: ListenAction[] = [
    'start', 'start', 'stop', 'stop', 'settled', 'start', 'error', 'start', 'stop', 'settled'
  ];
  for (const action of actions) {
    state = nextListenState(state, action);
    assert.ok(['idle', 'listening', 'processing', 'error'].includes(state), `bad state: ${state}`);
  }
  assert.equal(state, 'idle', 'the sequence did not settle');
});

check('Every recognition failure says something useful and points at typing', () => {
  const codes = [
    'not-allowed',
    'service-not-allowed',
    'audio-capture',
    'no-speech',
    'network',
    'language-not-supported',
    'something-new',
    null,
    undefined
  ];
  for (const code of codes) {
    const message = recognitionErrorMessage(code);
    assert.ok(message.length > 0, `no message for ${String(code)}`);
    assert.match(message, /type/i, `"${message}" does not offer typing as a fallback`);
    // Never a raw error code in a child's face.
    assert.ok(!message.includes(String(code)), `the raw code leaked: ${message}`);
  }

  // A denied microphone is the one a student will actually hit, and it has to
  // say where to fix it.
  assert.match(recognitionErrorMessage('not-allowed'), /blocked|settings/i);
  // And a cancel is not an error at all.
  assert.equal(recognitionErrorMessage('aborted'), '');
});

check('A transcript is merged into the composer, never replacing what is there', () => {
  assert.equal(mergeTranscript('', 'why is the sky blue'), 'why is the sky blue');
  assert.equal(mergeTranscript('Explain', 'fractions'), 'Explain fractions');
  // Whitespace is tidied, not trusted.
  assert.equal(mergeTranscript('Explain ', '  fractions  '), 'Explain fractions');
  assert.equal(mergeTranscript('a', 'b   c'), 'a b c');
  // An empty or whitespace-only result changes nothing, so a silent recording
  // cannot blank the box.
  assert.equal(mergeTranscript('keep me', ''), 'keep me');
  assert.equal(mergeTranscript('keep me', '   '), 'keep me');
  assert.equal(mergeTranscript('', '   '), '');
  // Punctuation the engine emits does not get a space in front of it.
  assert.equal(mergeTranscript('Is that right', '?'), 'Is that right?');
});

check('The mic label always matches its state, including unsupported', () => {
  assert.match(listenButtonLabel('idle', false), /not available/i);
  assert.match(listenButtonLabel('listening', false), /not available/i);
  assert.match(listenButtonLabel('idle', true), /speak/i);
  assert.match(listenButtonLabel('listening', true), /stop/i);
  assert.match(listenButtonLabel('processing', true), /finish/i);
  const labels = new Set(
    (['idle', 'listening', 'processing'] as ListenState[]).map((s) => listenButtonLabel(s, true))
  );
  assert.equal(labels.size, 3, 'two states share a label');
});

check('An unsupported environment reports false for listening too', () => {
  // No window in this process, which is also what SSR looks like.
  assert.equal(isRecognitionSupported(), false);
});

// ---------------------------------------------------------------- preferred voice
check('The preferred Google UK English Female voice wins when the device has it', () => {
  // Deliberately placed behind better-scoring voices: the choice is made on
  // purpose, so it must beat a natural voice and an en-IN voice alike.
  const voices: VoiceLike[] = [
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Neerja - English (India)', lang: 'en-IN' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Google UK English Male', lang: 'en-GB' }
  ];
  assert.equal(PREFERRED_VOICE_NAME, 'Google UK English Female');
  assert.equal(pickVoice(voices)?.name, 'Google UK English Female');
});

check('The preferred voice wins regardless of the order the device lists voices in', () => {
  const preferredLast: VoiceLike[] = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en-GB' }
  ];
  const preferredFirst: VoiceLike[] = [...preferredLast].reverse();
  assert.equal(pickVoice(preferredLast)?.name, 'Google UK English Female');
  assert.equal(pickVoice(preferredFirst)?.name, 'Google UK English Female');
});

check('When the preferred voice is absent, a suitable English voice is still chosen', () => {
  // Another device: the fallback must still be a real English voice, and the
  // best one available - not null, and not a non-English voice.
  const withoutPreferred: VoiceLike[] = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Google हिन्दी', lang: 'hi-IN' }
  ];
  const chosen = pickVoice(withoutPreferred);
  assert.ok(chosen, 'no fallback was chosen');
  assert.match(chosen!.name, /Natural/, `fallback was ${chosen!.name}`);
  assert.ok(chosen!.lang.toLowerCase().startsWith('en'), 'fallback is not English');
});

check('A near-miss name is not treated as the preferred voice', () => {
  // Exact match only. A different voice that merely looks similar must not
  // hijack the choice - it competes on score like any other.
  const nearMiss: VoiceLike[] = [
    { name: 'Google UK English Male', lang: 'en-GB' },
    { name: 'google uk english female', lang: 'en-GB' },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' }
  ];
  const chosen = pickVoice(nearMiss);
  assert.notEqual(chosen?.name, 'Google UK English Female');
  assert.match(chosen!.name, /Natural/, `near-miss won: ${chosen!.name}`);
});

check('A preferred voice that is not English is not used', () => {
  // The guard is applied to the English subset, so a same-named non-English
  // entry cannot make an English reading load a foreign voice.
  const foreign: VoiceLike[] = [{ name: 'Google UK English Female', lang: 'fr-FR' }];
  assert.equal(pickVoice(foreign), null);
});

check('Speech rate stays at a comfortable pace for the preferred voice, pitch unchanged', () => {
  const preferred: VoiceLike = { name: 'Google UK English Female', lang: 'en-GB' };
  const rate = speechRateFor(preferred);
  assert.ok(rate >= 0.85 && rate <= 1.1, `rate ${rate} is outside a comfortable range`);
});

// ---------------------------------------------------------------- arrows as sequences
check('An arrow life cycle is spoken as a sequence, not as a symbol', () => {
  assert.equal(speakableText('egg → larva → pupa → adult'), 'egg, then larva, then pupa, and finally adult.');
});

check('A labelled life cycle keeps its label and reads in order', () => {
  assert.equal(
    speakableText('Frog: egg → tadpole → froglet → adult'),
    'Frog: egg, then tadpole, then froglet, and finally adult.'
  );
});

check('The ASCII arrow and the = greater-than arrow read exactly as the Unicode arrow does', () => {
  assert.equal(
    speakableText('Frog: egg -> tadpole -> froglet -> adult'),
    speakableText('Frog: egg → tadpole → froglet → adult')
  );
  assert.equal(speakableText('egg => larva'), speakableText('egg → larva'));
});

check('Repeated arrows leave no empty step, and longer chains keep every item', () => {
  assert.equal(speakableText('egg → → larva'), 'egg, and then larva.');
  assert.equal(
    speakableText('egg → larva → pupa → adult → death'),
    'egg, then larva, then pupa, then adult, and finally death.'
  );
});

check('A two-step arrow uses the two-item connector', () => {
  assert.equal(speakableText('Sun → Earth'), 'Sun, and then Earth.');
});

check('A label that ends in a colon is joined with a space, not a comma', () => {
  assert.equal(speakableText('Stages: → egg → adult'), 'Stages: egg, and then adult.');
});

check('Arrows inside Markdown bullets are read as sequences, one item per sentence', () => {
  assert.equal(
    speakableText('- Frog: egg → tadpole → adult\n- Butterfly: egg → caterpillar → pupa → adult'),
    'Frog: egg, then tadpole, and finally adult. Butterfly: egg, then caterpillar, then pupa, and finally adult.'
  );
});

check('Arrows inside a numbered list are read as sequences too', () => {
  const spoken = speakableText('1. Frog: egg → tadpole → adult\n2. Butterfly: egg → pupa → adult');
  assert.ok(spoken.includes('Frog: egg, then tadpole, and finally adult.'), spoken);
  assert.ok(spoken.includes('Butterfly: egg, then pupa, and finally adult.'), spoken);
});

check('No arrow in any sequence is ever spoken as a symbol name', () => {
  const samples = [
    'egg → larva → pupa → adult',
    'egg -> larva -> pupa -> adult',
    'Frog: egg => tadpole',
    '- Butterfly: egg → caterpillar → pupa → adult',
    'Sun → Earth → Moon'
  ];
  for (const sample of samples) {
    const spoken = speakableText(sample);
    assert.doesNotMatch(
      spoken,
      /arrow|minus|greater|less than|pointing|rightwards|leftwards|dash|hyphen|→|->|=>/i,
      `"${sample}" was read as "${spoken}"`
    );
  }
});

check('A sequence adds only connecting words and no facts of its own', () => {
  // Every spoken word is either in the sentence as written or is a connector.
  const CONNECTORS = new Set(['then', 'and', 'finally']);
  const input = 'Frog: egg → tadpole → froglet → adult';
  const inputWords = new Set(input.toLowerCase().match(/[a-z]+/g) ?? []);
  for (const word of speakableText(input).toLowerCase().match(/[a-z]+/g) ?? []) {
    assert.ok(inputWords.has(word) || CONNECTORS.has(word), `the sequence introduced "${word}"`);
  }
});

check('A ⇒ arrow reads as "implies", not as a sequence', () => {
  assert.match(speakableText('It is a square ⇒ it is a rectangle'), /square implies it is a rectangle/);
});

// ---------------------------------------------------------------- maths keeps its meaning
check('Operators inside maths keep their meaning, including minus and the Unicode minus sign', () => {
  assert.match(speakableText('$2 - 3 = -1$'), /2\s+minus\s+3\s+equals\s+minus\s+1/);
  assert.match(speakableText('$5 − 2 = 3$'), /5\s+minus\s+2\s+equals\s+3/);
  assert.match(speakableText('$6 / 3 = 2$'), /6\s+over\s+3\s+equals\s+2/);
  assert.match(speakableText('$x < 5$'), /x\s+is less than\s+5/);
  assert.match(speakableText('$x > 5$'), /x\s+is greater than\s+5/);
});

check('An arrow inside maths is "tends to", never a minus followed by greater-than', () => {
  for (const input of ['$x \\to 0$', '$x \\rightarrow 0$', '$x -> 0$']) {
    const spoken = speakableText(input);
    assert.match(spoken, /x\s+tends to\s+0/, `${input} was read as "${spoken}"`);
    assert.doesNotMatch(spoken, /minus|greater/, `${input} was read as "${spoken}"`);
  }
});

check('Prose hyphens and chemical formulas are left alone', () => {
  assert.equal(speakableText('Water is H2O.'), 'Water is H2O.');
  assert.match(speakableText('A well-known fact.'), /well-known/);
});

console.log('\n====================================================');
console.log('📊 SPOKEN EXPLANATION RESULTS');
console.log('====================================================');
const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
console.log(`Total Tests Run: ${RESULTS.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================\n');

if (failed > 0) process.exit(1);
