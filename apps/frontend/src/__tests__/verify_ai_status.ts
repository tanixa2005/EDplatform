/**
 * Voice input stays off while external AI is off, and read-aloud uses only the
 * one voice the project owner approved (Google UK English Female).
 *
 * Two kinds of check, neither needing a browser:
 *   - the pure rule that decides whether the mic may be shown, which must fail
 *     closed on anything but an explicit yes from the backend;
 *   - source tripwires on the composer, the speech-input hook and the speech
 *     provider, so a later edit cannot quietly bring back an always-visible
 *     mic, another read-aloud voice, or a fallback to the engine's default.
 *
 * What this cannot cover - which voices a given browser offers, or how the
 * composer looks - is a limitation, not a pass.
 *
 * Run: npx tsx src/__tests__/verify_ai_status.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVoiceInputAllowed } from '../lib/ai-status.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

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

// ---------------------------------------------------------------- the mic rule
check('The mic is allowed only on an explicit voiceInputAllowed: true', () => {
  assert.equal(isVoiceInputAllowed({ tutorPaused: false, voiceInputAllowed: true }), true);
});

check('Loading, failure, signed out and AI off all mean no mic', () => {
  for (const status of [
    null,
    undefined,
    {},
    { tutorPaused: true, voiceInputAllowed: false },
    { tutorPaused: false, voiceInputAllowed: false }
  ]) {
    assert.equal(isVoiceInputAllowed(status), false, JSON.stringify(status));
  }
});

check('A malformed reply means no mic', () => {
  for (const status of [
    { voiceInputAllowed: 'true' },
    { voiceInputAllowed: 1 },
    { voice_input_allowed: true },
    'voiceInputAllowed',
    true,
    42
  ]) {
    assert.equal(isVoiceInputAllowed(status), false, JSON.stringify(status));
  }
});

// ---------------------------------------------------------------- source tripwires
check('The composer renders the mic only when voice input is allowed', () => {
  const askBar = read('components', 'tutor', 'ask-bar.tsx');
  assert.ok(askBar.includes('const voiceAllowed = isVoiceInputAllowed(useAiStatus());'), 'the status gate is missing');
  assert.ok(askBar.includes('useSpeechInput(handleTranscript, { enabled: voiceAllowed })'), 'the hook is not gated');
  assert.ok(askBar.includes('{voiceAllowed && ('), 'the mic button is not conditional');
  const micIcon = askBar.indexOf('<Mic ');
  const gate = askBar.indexOf('{voiceAllowed && (');
  assert.ok(gate > 0 && micIcon > gate, 'the mic icon sits outside the gate');
});

check('The speech-input hook refuses to open the mic while disabled', () => {
  const hook = read('lib', 'use-speech-input.ts');
  const start = hook.indexOf('const start = useCallback(() => {');
  assert.ok(start >= 0, 'start not found');
  const firstStatement = hook.slice(start).split('\n')[1].trim();
  assert.equal(firstStatement, 'if (!enabled) return;', 'start does not check enabled first');
  assert.ok(hook.includes('if (enabled) return;'), 'an active session is not released when disabled');
});

check('Read-aloud never falls back to the engine default voice', () => {
  const provider = read('context', 'speech-context.tsx');
  assert.ok(provider.includes('if (!voice) return;'), 'play does not refuse without a chosen voice');
  assert.ok(!provider.includes("utterance.lang = 'en-IN'"), 'the engine-default fallback is back');
  assert.ok(provider.includes('setSupported(voiceRef.current !== null);'), 'supported no longer follows the chosen voice');
});

check('Read-aloud uses only the owner-approved voice, with no scoring fallback', () => {
  // Google UK English Female is a cloud voice in desktop Chrome. Using it for
  // read-aloud was approved by the project owner; no other voice may be picked.
  const speech = read('lib', 'speech.ts');
  assert.ok(
    speech.includes("export const READ_ALOUD_VOICE = { name: 'Google UK English Female', lang: 'en-GB' } as const;"),
    'the read-aloud voice changed'
  );
  assert.ok(speech.includes('return voices.find((voice) => isReadAloudVoice(voice)) ?? null;'), 'pickVoice is not exact-match only');
  assert.ok(!/localService === false\) score/.test(speech), 'a cloud voice bonus is back');
});

// ---------------------------------------------------------------- summary
console.log('\n====================================================');
console.log('📊 AI STATUS / ON-DEVICE SPEECH RESULTS');
console.log('====================================================');
const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
console.log(`Total Tests Run: ${RESULTS.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================\n');
process.exit(failed > 0 ? 1 : 0);
