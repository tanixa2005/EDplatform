// Imported FIRST by suites written before AI was off by default, which assume
// the live AI path (with the Mock answering when no key is set). ES modules
// evaluate imports in order, so this runs before env.config.ts reads the
// environment. An AI_TUTOR_MODE the caller set explicitly is left alone.
process.env.AI_TUTOR_MODE ??= 'live';

export {};
