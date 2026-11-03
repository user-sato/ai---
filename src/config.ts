import { z } from 'zod';
const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(8080),
  DRY_RUN: flag('true'),
  EXTERNAL_PROCESSING_APPROVED: flag('false'),
  LINE_CHANNEL_SECRET: z.string().default(''),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().default(''),
  LINE_ADMIN_USER_IDS: z.string().default(''),
  LINE_GROUP_ID: z.string().default(''),
  PROJECT_ID: z.string().default('main'),
  PROJECT_NAME: z.string().default('LINEプロジェクト'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_DRIVE_ROOT_ID: z.string().default(''),
  GOOGLE_ACCESS_REVIEWED: flag('false'),
  INTERNAL_AUTH_MODE: z.enum(['oidc', 'local']).default('oidc'),
  INTERNAL_LOCAL_TOKEN: z.string().default(''),
  INTERNAL_AUDIENCE: z.string().default(''),
  INTERNAL_SERVICE_ACCOUNT: z.string().default(''),
  GCP_PROJECT_ID: z.string().default(''),
  GCP_LOCATION: z.string().default('asia-northeast1'),
  TASKS_QUEUE: z.string().default('line-secretary'),
  WORKER_URL: z.string().default(''),
  MAX_ANALYSIS_MESSAGES: z.coerce.number().int().min(1).max(100).default(50),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!c.DRY_RUN) {
    if (!c.EXTERNAL_PROCESSING_APPROVED || !c.GOOGLE_ACCESS_REVIEWED)
      throw new Error('Production consent/access review required');
    for (const key of [
      'LINE_CHANNEL_SECRET',
      'LINE_CHANNEL_ACCESS_TOKEN',
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REFRESH_TOKEN',
      'GOOGLE_DRIVE_ROOT_ID',
      'GCP_PROJECT_ID',
      'WORKER_URL',
    ] as const) {
      if (!c[key]) throw new Error(`Missing configuration: ${key}`);
    }
  }
  if (
    !c.DRY_RUN &&
    (c.INTERNAL_AUTH_MODE !== 'oidc' ||
      !c.WORKER_URL.startsWith('https://') ||
      c.WORKER_URL !== c.INTERNAL_AUDIENCE)
  )
    throw new Error('Live mode requires OIDC and matching HTTPS worker URL/audience');
  if (c.INTERNAL_AUTH_MODE === 'local' && c.INTERNAL_LOCAL_TOKEN.length < 32)
    throw new Error('Local internal token must have >=32 characters');
  if (c.INTERNAL_AUTH_MODE === 'oidc' && (!c.INTERNAL_AUDIENCE || !c.INTERNAL_SERVICE_ACCOUNT))
    throw new Error('OIDC audience and service account required');
  return c;
}
