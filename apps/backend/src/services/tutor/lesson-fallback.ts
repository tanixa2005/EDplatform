/**
 * What a student sees when every AI route has failed, in a session that is
 * about one lesson.
 *
 * Everything here is either fixed wording or the lesson's own stored text,
 * copied verbatim. Nothing is generated, summarised or reworded, so nothing
 * can be invented: the lesson body is reviewed content written to be read by
 * a student (see curriculum-content.ts), and only its opening is used.
 *
 * Deliberately narrow:
 *   - lesson sessions only. A free chat ("What is a noun?") has no stored text
 *     that is known to answer it, so it gets the ordinary unavailable message;
 *   - text turns only. A photo turn is never answered with lesson text, which
 *     could read as a description of the picture;
 *   - never the quiz-hint path. Stored quiz explanations give the answer away.
 */

/** Longer than this and the opening is not used at all - it is never cut short. */
export const LESSON_FALLBACK_MAX_CHARS = 900;

/**
 * The lesson's opening: the text before its first Markdown heading, or its
 * first paragraph when it has no headings. Verbatim, or null when there is
 * nothing suitable.
 */
export function lessonIntroduction(content: string | null | undefined): string | null {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const headingAt = lines.findIndex((line) => /^#{1,6}\s/.test(line));
  const opening =
    headingAt === -1
      ? (lines.join('\n').trim().split(/\n\s*\n/)[0] ?? '')
      : lines.slice(0, headingAt).join('\n');
  const trimmed = opening.trim();
  if (trimmed === '' || trimmed.length > LESSON_FALLBACK_MAX_CHARS) return null;
  return trimmed;
}

/**
 * The full reply. Honest that ED could not answer, and clear that what
 * follows is the lesson's own text rather than an answer to the question.
 */
export function lessonFallbackReply(lessonTitle: string, introduction: string): string {
  return (
    `I can't reach my thinking tools right now, so I can't answer that properly yet. ` +
    `While you wait, here's how your lesson "${lessonTitle}" begins:\n\n` +
    `${introduction}\n\n` +
    `Try asking me again in a minute.`
  );
}
