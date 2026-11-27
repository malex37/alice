import { z } from 'zod';

// `FOO=` in an env file means "unset", not "empty value".
const optional = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const Env = z.object({
  QDIFY_HOST: optional.transform((value) => value ?? '127.0.0.1'),
  QDIFY_PORT: optional
    .transform((value) => value ?? '8787')
    .pipe(z.coerce.number<string>().int().min(1).max(65_535)),
  QDIFY_DB_PATH: optional.transform((value) => value ?? 'data/qdify.db'),
  QDIFY_API_TOKEN: optional,
  QDIFY_WEB_DIST: optional,
});

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = Env.parse(env);
  return {
    host: parsed.QDIFY_HOST,
    port: parsed.QDIFY_PORT,
    dbPath: parsed.QDIFY_DB_PATH,
    token: parsed.QDIFY_API_TOKEN,
    webDist: parsed.QDIFY_WEB_DIST,
  };
}
