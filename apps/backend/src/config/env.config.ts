import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z
  .object({
    PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/edplatform?schema=public'),
    JWT_SECRET: z.string().default('edplatform-development-secret-key-at-least-32-chars-long'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    COOKIE_SECURE: z.string().optional().transform((val) => val === 'true'),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional().transform((val) => (val && val.trim() !== '' ? val : undefined)),
    GEMINI_API_KEY: z.string().optional().default('')
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
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
