import dotenv from 'dotenv';
import { z } from 'zod';
import { parseAllowedOrigins } from './cors-origins.js';
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
    // OpenRouter is the live AI provider. Optional with an empty default, so
    // the app boots and builds with no key at all and the Mock answers - which
    // is what every local run and the whole security suite rely on.
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
     * A switch that stops every external AI request without touching the AI
     * configuration above. 'live' (or unset) is normal operation. Any other
     * value pauses: tutor turns, photo questions and quiz hints are refused
     * with a plain message before anything is stored or sent, and quiz
     * analysis uses the local, non-AI version.
     *
     * A free string rather than an enum on purpose: a typo must pause the AI,
     * never stop the whole server from starting. See ai-availability.ts.
     */
    AI_TUTOR_MODE: z.string().optional().default('live'),

    // DEPRECATED, kept only so an existing .env with these still parses. The
    // Gemini provider is no longer selectable; nothing reads these values.
    GEMINI_API_KEY: z.string().optional().default(''),
    GEMINI_MODEL: z.string().optional().default('gemini-3.6-flash'),

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
    if (data.OFFLINE_DEMO_AI) {
      // Fails closed: every problem refuses startup, and no message contains a value.
      for (const message of offlineDemoProblems(data)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OFFLINE_DEMO_AI'], message });
      }
    }

    if (data.NODE_ENV === 'production') {
      // Without a key the factory would select the Mock, which answers with
      // canned replies and no sign that the AI is off. In production that is a
      // silent failure, so startup refuses instead. The message names the
      // variable and never the value.
      // The offline demo is the one explicit exception, and it is only accepted by
      // offlineDemoProblems above, which refuses any key and any other database.
      if (data.OPENROUTER_API_KEY.trim() === '' && !data.OFFLINE_DEMO_AI) {
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
