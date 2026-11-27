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
  QDIFY_DYNAMODB_TABLE: optional.transform((value) => value ?? 'qdify-tasks'),
  // Set for MiniStack (http://127.0.0.1:4566). Unset means real AWS DynamoDB.
  QDIFY_DYNAMODB_ENDPOINT: optional.pipe(z.url({ protocol: /^https?$/ }).optional()),
  AWS_REGION: optional,
  QDIFY_API_TOKEN: optional,
  QDIFY_WEB_DIST: optional,
});

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = Env.parse(env);
  return {
    host: parsed.QDIFY_HOST,
    port: parsed.QDIFY_PORT,
    dynamodb: {
      table: parsed.QDIFY_DYNAMODB_TABLE,
      endpoint: parsed.QDIFY_DYNAMODB_ENDPOINT,
      region: parsed.AWS_REGION,
    },
    token: parsed.QDIFY_API_TOKEN,
    webDist: parsed.QDIFY_WEB_DIST,
  };
}
