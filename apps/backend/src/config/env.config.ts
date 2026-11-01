import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_AI_TUTOR_MODE, resolveAiTutorMode } from './ai-mode.js';
import { parseAllowedOrigins } from './cors-origins.js';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, isSupportedGeminiModel } from './gemini-models.js';
import { offlineDemoProblems } from './offline-demo.js';

// Load .env file
dotenv.config();

export const envSchema = z
  .object({
    PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Validated at startup: an unsafe or empty entry stops the server with a
    // message that names the problem, rather than failing every browser request.
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:3000')
      .superRefine((value, ctx) => {
        try {
          parseAllowedOrigins(value);
        } catch (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err instanceof Error ? err.message : 'CORS_ORIGIN is invalid'
          });
        }
      }),
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/edplatform?schema=public'),
    JWT_SECRET: z.string().default('edplatform-development-secret-key-at-least-32-chars-long'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    COOKIE_SECURE: z.string().optional().transform((val) => val === 'true'),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional().transform((val) => (val && val.trim() !== '' ? val : undefined)),
    // OpenRouter is the live AI provider, used only when AI_TUTOR_MODE is
    // 'live'. Optional with an empty default, so the app boots and builds with
    // no key at all - which is what every local run and the whole security
    // suite rely on.
    OPENROUTER_API_KEY: z.string().optional().default(''),
    // Configurable for the same reason the Gemini model id was: hosted model
    // ids are retired and renamed, and a free-tier id especially so. Override
    // with OPENROUTER_MODEL.
    OPENROUTER_MODEL: z.string().optional().default('apodex/apodex-1.1-mini:free'),
    /**
     * The route used ONLY for turns that carry a photo. Text turns never use it.
     *
     * Separate from OPENROUTER_MODEL because the text model reads text only:
     * sending it a photo is refused upstream, and that refusal used to surface
     * as "ED is having trouble connecting". Two settings, two routes, and
     * changing one leaves the other alone.
     *
     * The default is 'openrouter/free', OpenRouter's own free router. It was
     * chosen because a specific Qwen model id returned 404 on this account, and
     * the router is the documented free entry point. Whether the router accepts
     * photos on every request is NOT confirmed from this codebase - that needs
     * a live check, which was not made.
     *
     * Two things keep a wrong value safe: the provider only uses 'openrouter/free'
     * or a ':free' model id (see isFreeVisionRoute), so a paid route is refused,
     * and there is no fallback - an unavailable route produces a clear error,
     * never a different model.
     *
     * An explicit value in .env replaces this default. Set it to an empty
     * string to turn photo support off entirely. It is a model id, not a
     * credential.
     */
    OPENROUTER_VISION_MODEL: z.string().optional().default('openrouter/free'),

    /**
     * The switch for every external AI request. OFF by default: only 'live'
     * turns it on. Unset or any other value pauses: tutor turns, photo
     * questions and quiz hints are refused with a plain message before
     * anything is stored or sent, quiz analysis uses the local, non-AI version,
     * and the OpenRouter client is never created.
     *
     * 'mock' answers tutor turns, photo questions and quiz hints with the local
     * Mock tutor instead, labelled as an offline demo response. External AI
     * stays off exactly as when paused, and no key is needed or used.
     *
     * A free string rather than an enum on purpose: a typo must pause the AI,
     * never stop the whole server from starting. See config/ai-mode.ts.
     */
    AI_TUTOR_MODE: z.string().optional().default(DEFAULT_AI_TUTOR_MODE),

    /**
     * Which AI vendor is live. Explicit on purpose: a key being present never
     * selects a provider by itself, and one provider never stands in for the
     * other when it fails (see resolveProviderChoice in provider.factory.ts).
     *
     *   unset        - unchanged legacy behaviour: OpenRouter when
     *                  OPENROUTER_API_KEY is set, otherwise the Mock. A stale
     *                  GEMINI_API_KEY alone selects nothing.
     *   'openrouter' - OpenRouter only.
     *   'gemini'     - the direct Gemini API only (GEMINI_API_KEY, GEMINI_MODEL).
     *                  OpenRouter is never constructed or called.
     *
     * NOTE: Google's Gemini API terms restrict use in services directed at, or
     * likely to be accessed by, people under 18. 'gemini' must not be set for
     * real student traffic until that is resolved - see
     * docs/ai-provider-terms-review.md.
     */
    AI_PROVIDER: z.enum(['openrouter', 'gemini']).optional(),

    // The direct Gemini API. Read only on the server, only by the factory, and
    // only when AI_PROVIDER is 'gemini'. The key is never logged or echoed.
    GEMINI_API_KEY: z.string().optional().default(''),
    // A Gemini model from the allowlist in gemini-models.ts. Anything else -
    // a Gemma model, a 2.5 model, a TTS or image variant - refuses startup when
    // AI_PROVIDER is 'gemini'.
    GEMINI_MODEL: z.string().optional().default(DEFAULT_GEMINI_MODEL),
    // The adult accounts (comma-separated emails) that live Gemini is served
    // to. Everyone else is answered as when paused. Empty means nobody - see
    // services/ai/ai-audience.ts. Not a secret, but never sent to the client.
    AI_LIVE_ALLOWED_EMAILS: z.string().optional().default(''),

    // Clerk. Optional so the app still boots (and builds) without them during
    // the migration; requests then fall back to the legacy JWT cookie.
    CLERK_SECRET_KEY: z.string().optional().default(''),
    CLERK_PUBLISHABLE_KEY: z.string().optional().default(''),
    CLERK_WEBHOOK_SECRET: z.string().optional().default(''),
    // Off unless set to exactly 'true' (blank counts as off). Runs the offline Mock tutor in production
    // mode for the isolated demo backend. Its rules live in offline-demo.ts.
    OFFLINE_DEMO_AI: z.enum(['true', 'false', '']).default('false').transform((val) => val === 'true'),
    OFFLINE_DEMO_EXPECT_ENDPOINT: z.string().optional().default('')
  })
  .superRefine((data, ctx) => {
    // In every environment: a Gemini selection must name an allowlisted Gemini
    // model, so a Gemma or unsupported id is refused rather than sent.
    if (data.AI_PROVIDER === 'gemini' && !isSupportedGeminiModel(data.GEMINI_MODEL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_MODEL'],
        message: `GEMINI_MODEL must be one of: ${Object.keys(GEMINI_MODELS).join(', ')}`
      });
    }

    if (data.OFFLINE_DEMO_AI) {
      // Fails closed: every problem refuses startup, and no message contains a value.
      for (const message of offlineDemoProblems(data)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OFFLINE_DEMO_AI'], message });
      }
      // The demo never makes AI requests, so a provider choice is a mistake.
      if (data.AI_PROVIDER === 'gemini') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AI_PROVIDER'],
          message: 'OFFLINE_DEMO_AI=true must not be combined with AI_PROVIDER=gemini'
        });
      }
    }

    if (data.NODE_ENV === 'production') {
      // In live mode, without a key the factory would select the Mock, which
      // answers with canned replies and no sign that the AI is off. In
      // production that is a silent failure, so startup refuses instead. The
      // message names the variable and never the value.
      // While AI is paused no key is needed: the factory selects the disabled
      // provider, which refuses honestly and never touches the network.
      // The offline demo is the other exception, and it is only accepted by
      // offlineDemoProblems above, which refuses any key and any other database.
      const liveMode = resolveAiTutorMode(data.AI_TUTOR_MODE) === 'live' && !data.OFFLINE_DEMO_AI;
      if (liveMode && data.AI_PROVIDER === 'gemini') {
        if (data.GEMINI_API_KEY.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['GEMINI_API_KEY'],
            message:
              'GEMINI_API_KEY is required in production when AI_PROVIDER=gemini. Without it the app would serve canned Mock replies to students. Set it in the host environment and restart.'
          });
        }
      } else if (liveMode && data.OPENROUTER_API_KEY.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OPENROUTER_API_KEY'],
          message:
            'OPENROUTER_API_KEY is required in production. Without it the app would serve canned Mock replies to students. Set it in the host environment and restart.'
        });
      }
      if (data.JWT_SECRET === 'edplatform-development-secret-key-at-least-32-chars-long') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'Production deployment requires a unique JWT_SECRET (cannot use the development fallback key).'
        });
      }
      if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be at least 32 characters long in production.'
        });
      }
      if (data.CLERK_SECRET_KEY && !data.CLERK_SECRET_KEY.startsWith('sk_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CLERK_SECRET_KEY'],
          message: 'CLERK_SECRET_KEY must be a Clerk secret key starting with "sk_".'
        });
      }
      if (data.DATABASE_URL.includes('localhost') || data.DATABASE_URL.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL points to localhost in production. A production PostgreSQL connection string is required.'
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;

/** True once Clerk is configured; drives the dual-auth fallback during migration. */
export const isClerkEnabled = env.CLERK_SECRET_KEY.trim() !== '';

/** True once a real AI provider is configured; false means the Mock answers. */
export const isAIProviderConfigured = env.OPENROUTER_API_KEY.trim() !== '';

/** True once a route for photo questions has been configured and confirmed. */
export const isVisionConfigured = env.OPENROUTER_VISION_MODEL.trim() !== '';
