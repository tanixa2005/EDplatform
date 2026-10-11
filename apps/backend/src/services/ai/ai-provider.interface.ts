export interface AIMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Side-channel context for providers that need the raw facts rather than the
 * assembled prompt. The live provider ignores this; the Mock provider uses it
 * to produce a class- and subject-appropriate reply during local development.
 */
/**
 * Where the student is in their syllabus, for providers that cannot read the
 * assembled system prompt. Mirrors what the prompt says; never a second source
 * of truth.
 */
export interface CurriculumMeta {
  textbook: string | null;
  courseTitle: string;
  chapterTitle: string;
  /** Null for a chapter-level session, which has no topic to name. */
  topicTitle: string | null;
  topicObjective: string | null;
  /**
   * A short, reviewed teaching reference for this topic, when one is stored.
   *
   * Optional rather than required so the quiz-hint path, which builds its own
   * CurriculumMeta, is unaffected. Absent and null mean the same thing: no
   * brief, and the prompt renders as it did before briefs existed.
   */
  teachingBrief?: string | null;
}

export interface StreamMeta {
  classLevel?: string;
  subject?: string | null;
  action?: string | null;
  studentFirstName?: string | null;
  curriculum?: CurriculumMeta | null;
}

/**
 * One already-validated, already-stripped image for the current turn.
 *
 * Only ever produced by image-validation.service, so by the time a provider
 * sees this the bytes have been sniffed, size- and dimension-checked, and
 * re-encoded without EXIF. Buffer rather than base64 so nothing stringifies it
 * into a log line by accident.
 */
export interface TutorImage {
  mimeType: string;
  data: Buffer;
}

export interface StreamParams {
  systemPrompt: string;
  userPrompt: string;
  history?: AIMessage[];
  meta?: StreamMeta;
  /**
   * Images attached to THIS turn only. The MVP sends at most one, and never
   * replays images from earlier turns - nothing persists them, so history is
   * text-only by construction.
   */
  images?: TutorImage[];
  onChunk: (chunk: string) => Promise<void> | void;
}

export interface StructuredParams<T> {
  systemPrompt: string;
  userPrompt: string;
  schema?: unknown;
  fallbackGenerator?: () => T;
}

export interface IAITutorProvider {
  readonly name: string;
  /**
   * Whether this provider can actually look at an attached photo.
   *
   * Declared rather than assumed, because getting it wrong is silent: the
   * image is base64'd into a perfectly well-formed request, the route rejects
   * it, and the student is told the connection is broken. A provider that
   * cannot see pictures has to say so before anything is sent.
   */
  readonly supportsImages: boolean;
  generateStream(params: StreamParams): Promise<string>;
  generateStructured<T>(params: StructuredParams<T>): Promise<T>;
}
