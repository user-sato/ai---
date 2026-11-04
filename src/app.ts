import Fastify, { LogController } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { signatureValid } from './domain.js';
import { ingest } from './services/ingest.js';
import { Worker, schedule } from './jobs.js';
export interface InternalAuth {
  verify(token: string): Promise<boolean>;
}
export function internalAuth(c: Config): InternalAuth {
  const client = new OAuth2Client();
  return {
    verify: async (token) => {
      if (c.INTERNAL_AUTH_MODE === 'local') {
        const a = Buffer.from(token),
          b = Buffer.from(c.INTERNAL_LOCAL_TOKEN);
        return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
      }
      try {
        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: c.INTERNAL_AUDIENCE,
        });
        const p = ticket.getPayload();
        return (
          p?.email === c.INTERNAL_SERVICE_ACCOUNT &&
          p.email_verified === true &&
          ['accounts.google.com', 'https://accounts.google.com'].includes(p.iss)
        );
      } catch {
        return false;
      }
    },
  };
}
export function buildApp(
  prisma: PrismaClient,
  c: Config,
  worker: Worker,
  auth: InternalAuth = internalAuth(c),
) {
  const app = Fastify({
    logger: { level: 'info' },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
  });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    // Never log errors from SDKs, request bodies, headers, SQL, or validation values.
    app.log.warn({ event: 'request_failed', status: status && status < 500 ? status : 500 });
    reply.code(status && status < 500 ? status : 500).send({ error: 'request_failed' });
  });
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.post('/webhook/line', async (request, reply) => {
    const body = request.body as Buffer;
    const signature = request.headers['x-line-signature'];
    if (
      !Buffer.isBuffer(body) ||
      typeof signature !== 'string' ||
      !signatureValid(body, signature, c.LINE_CHANNEL_SECRET)
    )
      return reply.code(401).send({ error: 'invalid_signature' });
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      return reply.code(400).send({ error: 'invalid_json' });
    }
    try {
      await ingest(prisma, parsed);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_event' });
      throw error;
    }
    return { ok: true };
  });
  app.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions.url?.startsWith('/internal/')) return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || !(await auth.verify(authorization.slice(7))))
      return reply.code(401).send({ error: 'unauthorized' });
    if (c.DRY_RUN) return reply.code(409).send({ error: 'dry_run_use_isolated_script' });
  });
  app.post('/internal/jobs/run', async (request, reply) => {
    const body = z.object({ jobId: z.string().uuid() }).strict().safeParse(parseBody(request.body));
    if (!body.success) return reply.code(400).send({ error: 'invalid_job' });
    const job = await prisma.job.findUnique({ where: { id: body.data.jobId } });
    if (job?.type === 'notify') await worker.prepareNotification(job.payload);
    await worker.run(body.data.jobId);
    return { ok: true };
  });
  app.post('/internal/jobs/dispatch', async () => worker.drain());
  for (const type of [
    'analyze',
    'sync',
    'daily-reconcile',
    'weekly-report',
    'monthly-rollover',
    'monthly-report',
  ]) {
    app.post(`/internal/jobs/${type}`, async (request, reply) => {
      const raw = request.headers['x-cloudscheduler-scheduletime'];
      const time = typeof raw === 'string' ? new Date(raw) : new Date();
      if (!Number.isFinite(time.getTime()) || time.getTime() > Date.now() + 300000)
        return reply.code(400).send({ error: 'invalid_schedule_time' });
      await schedule(prisma, type === 'sync' ? 'daily-reconcile' : type, time);
      return { ok: true };
    });
  }
  return app;
}
function parseBody(body: unknown): unknown {
  try {
    return Buffer.isBuffer(body) ? JSON.parse(body.toString()) : body;
  } catch {
    return null;
  }
}
