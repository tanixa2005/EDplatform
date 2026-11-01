import type { AIMessage } from '../ai/ai-provider.interface.js';

/**
 * How much of the stored conversation is replayed to the model.
 *
 * TUTOR_HISTORY_TURNS already caps the count (the last 12 messages). This caps
 * the size as well: twelve long explanations can be several thousand tokens of
 * input on every turn, which is most of a free per-minute token budget. About
 * 8,000 characters (roughly 2,000 tokens) keeps the last few exchanges - enough
 * to follow "I still don't get it" or "what about the second one?" - without
 * resending the whole transcript each time.
 */
export const TUTOR_HISTORY_CHAR_BUDGET = 8_000;

/**
 * The newest messages that fit the budget, oldest first.
 *
 * Messages are kept whole or dropped whole - never cut mid-sentence, which
 * would hand the model a misleading fragment. The newest message is always
 * kept. The result starts with a student turn, so the model never sees a reply
 * without the question it answered.
 */
export function boundHistory(history: AIMessage[], budget: number = TUTOR_HISTORY_CHAR_BUDGET): AIMessage[] {
  const kept: AIMessage[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const size = history[i].text.length;
    if (kept.length > 0 && used + size > budget) break;
    kept.unshift(history[i]);
    used += size;
  }
  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();
  return kept;
}
