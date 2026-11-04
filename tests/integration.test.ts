import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { ingest } from '../src/services/ingest.js';
import { mockPorts } from '../src/adapters/mock.js';
import { Worker } from '../src/jobs.js';
import { enqueue } from '../src/db.js';
import { analyze } from '../src/services/analyze.js';
import { command, queueNotification } from '../src/services/commands.js';
import { scheduleReport, privacyCleanup } from '../src/services/reports.js';
import { SyncService } from '../src/services/sync.js';
const enabled = process.env.RUN_DB_TESTS === '1';
const db = new PrismaClient();
let projectId: string;
let receipts: string[] = [];
const c = loadConfig({
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost/secretary',
  INTERNAL_AUTH_MODE: 'local',
  INTERNAL_LOCAL_TOKEN: 'test-token-'.repeat(4),
  LINE_CHANNEL_SECRET: 'synthetic-secret',
  LINE_ADMIN_USER_IDS: 'admin',
});
const ports = mockPorts();
let worker: Worker;
function event(
  text = '参加費1500円にしようかな',
  id = randomUUID(),
  at = '2026-11-08T10:00:00Z',
  user = 'speaker',
) {
  const webhookEventId = randomUUID();
  receipts.push(webhookEventId);
  return {
    webhookEventId,
    type: 'message',
    timestamp: new Date(at).getTime(),
    source: { type: 'group', groupId: projectId, userId: user },
    message: { id, type: 'text', text },
  };
}
async function runAll() {
  for (let i = 0; i < 12; i++) {
    const jobs = await db.job.findMany({
      where: { projectId, status: 'PENDING', nextAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    if (!jobs.length) break;
    for (const job of jobs) {
      await worker.prepareNotification(job.payload);
      await worker.run(job.id);
    }
  }
}
async function addCandidate() {
  const e = event();
  await ingest(db, { events: [e] });
  ports.ai.extract = async (m) => ({
    items: [
      {
        kind: 'DECISION',
        title: '参加費',
        detail: '1500円の提案',
        confidence: 0.8,
        evidence: [{ messageId: m[0]!.id, quote: '1500円' }],
      },
      {
        kind: 'TASK',
        title: 'チラシ作成',
        detail: '候補',
        confidence: 0.5,
        evidence: [{ messageId: m[0]!.id, quote: '1500円' }],
      },
    ],
  });
  await db.$transaction((tx) => analyze(tx, projectId, ports.ai, c));
  return e;
}
describe.skipIf(!enabled)('PostgreSQL + HTTP + mocked external APIs', () => {
  beforeEach(async () => {
    const u = new URL(process.env.DATABASE_URL!);
    if (!['127.0.0.1', 'localhost'].includes(u.hostname))
      throw new Error('Tests require local disposable DB');
    projectId = 'test-' + randomUUID();
    receipts = [];
    await db.project.create({ data: { id: projectId, name: 'Test', groupId: projectId } });
    ports.google.files.clear();
    ports.google.docs.clear();
    ports.google.sheets.clear();
    ports.google.fail = false;
    ports.line.sent = [];
    ports.ai.extract = async () => ({ items: [] });
    worker = new Worker(db, c, ports, true);
  });
  afterEach(async () => {
    await db.evidence.deleteMany({ where: { item: { projectId } } });
    await db.item.deleteMany({ where: { projectId } });
    await db.message.deleteMany({ where: { projectId } });
    await db.analysisBatch.deleteMany({ where: { projectId } });
    await db.document.deleteMany({ where: { projectId } });
    await db.folder.deleteMany({ where: { projectId } });
    await db.job.deleteMany({ where: { projectId } });
    await db.report.deleteMany({ where: { projectId } });
    await db.notification.deleteMany({ where: { projectId } });
    await db.audit.deleteMany({ where: { projectId } });
    await db.project.deleteMany({ where: { id: projectId } });
    await db.eventReceipt.deleteMany({ where: { id: { in: receipts } } });
  });
  afterAll(() => db.$disconnect());
  it('receives raw signed webhook, rejects bad signature and saves duplicate once', async () => {
    const app = buildApp(db, c, worker);
    const e = event();
    const payload = JSON.stringify({ events: [e] });
    const signature = createHmac('sha256', c.LINE_CHANNEL_SECRET).update(payload).digest('base64');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/webhook/line',
          headers: { 'content-type': 'application/json', 'x-line-signature': 'bad' },
          payload,
        })
      ).statusCode,
    ).toBe(401);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/webhook/line',
            headers: { 'content-type': 'application/json', 'x-line-signature': signature },
            payload,
          })
        ).statusCode,
      ).toBe(200);
    expect(await db.message.count({ where: { projectId } })).toBe(1);
    expect(await db.job.count({ where: { projectId } })).toBe(1);
    expect(ports.google.files.size).toBe(0);
    await app.close();
  });
  it('deduplicates different event IDs for the same message ID', async () => {
    const e = event();
    await ingest(db, { events: [e, event('duplicate', e.message.id)] });
    expect(await db.message.count({ where: { projectId } })).toBe(1);
  });
  it('does not collect unregistered groups or attachments', async () => {
    const e = event();
    e.source.groupId = 'unknown';
    await ingest(db, { events: [e, { ...event(), message: { id: randomUUID(), type: 'image' } }] });
    expect(await db.message.count({ where: { projectId } })).toBe(0);
  });
  it('rolls back both inbox and jobs on persistence failure', async () => {
    const e = event();
    await expect(
      db.$transaction(async (tx) => {
        await tx.message.create({
          data: {
            id: e.message.id,
            eventId: e.webhookEventId,
            projectId,
            body: 'test',
            sentAt: new Date(),
          },
        });
        await enqueue(tx, projectId, 'analyze', `atomic:${e.message.id}`);
        throw new Error('failure');
      }),
    ).rejects.toThrow();
    expect(await db.message.count({ where: { projectId } })).toBe(0);
    expect(await db.job.count({ where: { projectId } })).toBe(0);
  });
  it('keeps proposals pending, leaves unknown assignment NULL, and stores exact evidence', async () => {
    await addCandidate();
    const items = await db.item.findMany({ where: { projectId }, include: { evidence: true } });
    expect(items.every((i) => i.status === 'PENDING')).toBe(true);
    expect(items.find((i) => i.kind === 'TASK')?.assigneeUserId).toBeNull();
    expect(items[0]?.evidence[0]?.quote).toBe('1500円');
  });
  it('rejects fabricated evidence without marking the source analyzed', async () => {
    await ingest(db, { events: [event()] });
    ports.ai.extract = async () => ({
      items: [
        {
          kind: 'TASK',
          title: 'X',
          detail: '',
          confidence: 1,
          evidence: [{ messageId: 'fake', quote: 'fake' }],
        },
      ],
    });
    await expect(db.$transaction((tx) => analyze(tx, projectId, ports.ai, c))).rejects.toThrow();
    expect(await db.item.count({ where: { projectId } })).toBe(0);
    expect(await db.message.count({ where: { projectId, analyzedAt: null } })).toBe(1);
  });
  it('deduplicates same task from later messages and adds evidence', async () => {
    await addCandidate();
    await ingest(db, { events: [event()] });
    await db.$transaction((tx) => analyze(tx, projectId, ports.ai, c));
    expect(await db.item.count({ where: { projectId, kind: 'TASK' } })).toBe(1);
    expect(
      (await db.item.findFirst({ where: { projectId, kind: 'TASK' }, include: { evidence: true } }))
        ?.evidence,
    ).toHaveLength(2);
  });
  it('skips AI calls for empty conversations', async () => {
    const extract = vi.fn(ports.ai.extract);
    await db.$transaction((tx) => analyze(tx, projectId, { extract }, c));
    expect(extract).not.toHaveBeenCalled();
  });
  it('restricts approval to admins, audits confirmation, lists only confirmed decisions', async () => {
    await addCandidate();
    const item = await db.item.findFirstOrThrow({ where: { projectId, kind: 'DECISION' } });
    const unauthorized = event(`/bot 承認 ${item.id}`);
    await ingest(db, { events: [unauthorized] });
    await db.$transaction((tx) => command(tx, projectId, unauthorized.message.id, c));
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PENDING');
    const admin = event(`/bot 承認 ${item.id}`, randomUUID(), undefined, 'admin');
    await ingest(db, { events: [admin] });
    await db.$transaction((tx) => command(tx, projectId, admin.message.id, c));
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('CONFIRMED');
    expect(await db.audit.count({ where: { projectId, action: '承認' } })).toBe(1);
    const list = event('/bot 決定事項');
    await ingest(db, { events: [list] });
    await db.$transaction((tx) => command(tx, projectId, list.message.id, c));
    const n = await db.notification.findUniqueOrThrow({
      where: { key: `command:${list.message.id}` },
    });
    expect(n.text).toContain('参加費');
    expect(n.text).not.toContain('チラシ');
  });
  it('does not apply contradiction candidates on approval', async () => {
    const item = await db.item.create({
      data: {
        projectId,
        kind: 'CHANGE',
        title: '矛盾',
        detail: '変更候補',
        status: 'PENDING',
        fingerprint: 'change',
      },
    });
    const e = event(`/bot 承認 ${item.id}`, randomUUID(), undefined, 'admin');
    await ingest(db, { events: [e] });
    await db.$transaction((tx) => command(tx, projectId, e.message.id, c));
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PENDING');
  });
  it('creates each monthly folder once and retains old tasks in permanent sheets', async () => {
    await addCandidate();
    await db.$transaction(async (tx) => {
      const s = new SyncService(tx, ports.google, projectId, 'root');
      await s.monthFolder('2026-11');
      await s.monthFolder('2026-12');
      await s.monthFolder('2026-12');
      await s.current();
    });
    expect(await db.folder.count({ where: { projectId, key: '2026-12' } })).toBe(1);
    expect(
      [...ports.google.sheets.values()][0]?.Tasks?.some((row) => row.includes('チラシ作成')),
    ).toBe(true);
    const priorSize = ports.google.files.size;
    await db.$transaction((tx) => new SyncService(tx, ports.google, projectId, 'root').current());
    expect(ports.google.files.size).toBe(priorSize);
  });
  it('does not notify when Docs fails; retries then sends a single URL notification', async () => {
    await ingest(db, { events: [event()] });
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
    );
    ports.google.fail = true;
    const reportJob = await db.job.findFirstOrThrow({ where: { projectId, type: 'report' } });
    await expect(worker.run(reportJob.id)).rejects.toThrow();
    expect(ports.line.sent).toHaveLength(0);
    expect(await db.notification.count({ where: { projectId } })).toBe(0);
    expect((await db.job.findUniqueOrThrow({ where: { id: reportJob.id } })).attempts).toBe(1);
    ports.google.fail = false;
    await db.job.update({ where: { id: reportJob.id }, data: { nextAt: new Date(0) } });
    await runAll();
    expect(ports.line.sent).toHaveLength(1);
    expect(ports.line.sent[0]?.text).toContain('https://example.invalid/');
    await worker.run(reportJob.id);
    await runAll();
    expect(ports.line.sent).toHaveLength(1);
  });
  it('locks concurrent jobs and suppresses duplicate scheduled reports', async () => {
    await ingest(db, { events: [event()] });
    for (let i = 0; i < 2; i++)
      await db.$transaction((tx) =>
        scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
      );
    expect(await db.report.count({ where: { projectId } })).toBe(1);
    const job = await db.job.findFirstOrThrow({ where: { projectId, type: 'report' } });
    await Promise.all([worker.run(job.id), worker.run(job.id)]);
    await runAll();
    expect(ports.line.sent).toHaveLength(1);
    expect(await db.document.count({ where: { projectId, key: { startsWith: 'report:' } } })).toBe(
      1,
    );
  });
  it('skips empty weekly notifications', async () => {
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
    );
    await runAll();
    expect(ports.line.sent).toHaveLength(0);
    expect(ports.google.docs.size).toBe(0);
  });
  it('includes post-cutoff messages in next report, with exclusive boundaries', async () => {
    await ingest(db, {
      events: [
        event('before', randomUUID(), '2026-11-08T10:59:59Z'),
        event('boundary', randomUUID(), '2026-11-08T11:00:00Z'),
      ],
    });
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
    );
    await runAll();
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-15T11:00:00Z')),
    );
    await runAll();
    const reports = await db.report.findMany({
      where: { projectId },
      orderBy: { cutoffAt: 'asc' },
    });
    expect(reports[1]?.periodStart).toEqual(reports[0]?.periodEnd);
    expect((reports[0]?.snapshot as { text: string }).text).toContain('発言: 1件');
    expect((reports[1]?.snapshot as { text: string }).text).toContain('発言: 1件');
  });
  it('makes monthly documents without LINE notifications', async () => {
    await ingest(db, { events: [event()] });
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'monthly', new Date('2026-12-01T00:00:00Z')),
    );
    await runAll();
    expect(await db.report.count({ where: { projectId, type: 'monthly', status: 'READY' } })).toBe(
      1,
    );
    expect(ports.line.sent).toHaveLength(0);
  });
  it('uses the same retry key after uncertain LINE send and stops after 23h', async () => {
    await db.$transaction((tx) =>
      queueNotification(tx, projectId, `retry:${projectId}`, 'synthetic'),
    );
    const job = await db.job.findFirstOrThrow({ where: { projectId, type: 'notify' } });
    await worker.prepareNotification(job.payload);
    const push = ports.line.push.bind(ports.line);
    let fail = true;
    ports.line.push = async (...args) => {
      await push(...args);
      if (fail) throw new Error('uncertain send');
    };
    try {
      await expect(worker.run(job.id)).rejects.toThrow();
      fail = false;
      await db.job.update({ where: { id: job.id }, data: { nextAt: new Date(0) } });
      await worker.run(job.id);
      expect(ports.line.sent).toHaveLength(1);
    } finally {
      ports.line.push = push;
    }
    await db.$transaction((tx) =>
      queueNotification(tx, projectId, `expired:${projectId}`, 'synthetic'),
    );
    const n = await db.notification.findUniqueOrThrow({ where: { key: `expired:${projectId}` } });
    await db.notification.update({
      where: { id: n.id },
      data: { firstAttemptAt: new Date(Date.now() - 24 * 3600000) },
    });
    await runAll();
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe(
      'REVIEW_REQUIRED',
    );
    expect(ports.line.sent).toHaveLength(1);
  });
  it('honors unsend before message and removes evidence/derived data', async () => {
    const e = await addCandidate();
    const unsendId = randomUUID();
    receipts.push(unsendId);
    await ingest(db, {
      events: [
        {
          webhookEventId: unsendId,
          type: 'unsend',
          timestamp: Date.now(),
          source: e.source,
          unsend: { messageId: e.message.id },
        },
      ],
    });
    await db.$transaction((tx) => privacyCleanup(tx, projectId, e.message.id));
    expect(await db.item.count({ where: { projectId } })).toBe(0);
    expect((await db.message.findUniqueOrThrow({ where: { id: e.message.id } })).body).toBe('');
    const later = event();
    const early = randomUUID();
    receipts.push(early);
    await ingest(db, {
      events: [
        {
          webhookEventId: early,
          type: 'unsend',
          timestamp: Date.now(),
          source: later.source,
          unsend: { messageId: later.message.id },
        },
        later,
      ],
    });
    expect(
      (await db.message.findUniqueOrThrow({ where: { id: later.message.id } })).withdrawn,
    ).toBe(true);
  });
  it('disables collection and pending notifications when bot leaves', async () => {
    const id = randomUUID();
    receipts.push(id);
    await ingest(db, {
      events: [
        {
          webhookEventId: id,
          type: 'leave',
          timestamp: Date.now(),
          source: { type: 'group', groupId: projectId },
        },
      ],
    });
    await ingest(db, { events: [event()] });
    expect(await db.message.count({ where: { projectId } })).toBe(0);
  });
  it('protects internal endpoints and blocks real jobs in dry-run', async () => {
    const app = buildApp(db, c, worker);
    expect((await app.inject({ method: 'POST', url: '/internal/jobs/dispatch' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/jobs/dispatch',
          headers: { authorization: `Bearer ${c.INTERNAL_LOCAL_TOKEN}` },
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });
  it('does not expose request secrets or SDK errors in responses/logs', async () => {
    const app = buildApp(db, c, worker);
    const entries: unknown[] = [];
    app.log.warn = (...args: unknown[]) => {
      entries.push(args);
    };
    app.get('/test-failure', async () => {
      throw new Error('secret-API-key private-conversation');
    });
    const response = await app.inject('/test-failure');
    expect(response.statusCode).toBe(500);
    expect(response.body + JSON.stringify(entries)).not.toMatch(
      /secret-API-key|private-conversation/,
    );
    await app.close();
  });
  it('includes late delivery of an older message in the next weekly report', async () => {
    await ingest(db, { events: [event()] });
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
    );
    await runAll();
    const late = event('遅延到着', randomUUID(), '2026-11-07T00:00:00Z');
    await ingest(db, { events: [late] });
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-15T11:00:00Z')),
    );
    await runAll();
    const report = await db.report.findFirstOrThrow({
      where: { projectId },
      orderBy: { cutoffAt: 'desc' },
    });
    expect((report.snapshot as { text: string }).text).toContain('期間前の遅延到着: 1件');
    expect(
      (await db.message.findUniqueOrThrow({ where: { id: late.message.id } })).weeklyReportId,
    ).toBe(report.id);
  });
  it('does not process a later report before an earlier pending report', async () => {
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
    );
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-15T11:00:00Z')),
    );
    const jobs = await db.job.findMany({
      where: { projectId, type: 'report' },
      orderBy: { createdAt: 'asc' },
    });
    await worker.run(jobs[1]!.id);
    expect((await db.job.findUniqueOrThrow({ where: { id: jobs[1]!.id } })).status).toBe('PENDING');
    expect(ports.google.docs.size).toBe(0);
    await worker.run(jobs[0]!.id);
    await db.job.update({ where: { id: jobs[1]!.id }, data: { nextAt: new Date(0) } });
    await worker.run(jobs[1]!.id);
    expect(await db.report.count({ where: { projectId, status: 'EMPTY' } })).toBe(2);
  });
  it('removes withdrawn evidence from previously generated documents without renotifying', async () => {
    const e = await addCandidate();
    await db.$transaction((tx) =>
      scheduleReport(tx, projectId, 'weekly', new Date('2026-11-08T11:00:00Z')),
    );
    await runAll();
    expect([...ports.google.docs.values()].some((t) => t.includes('1500円'))).toBe(true);
    expect(ports.line.sent[0]?.text).toContain('[PENDING] 参加費');
    const sent = ports.line.sent.length;
    await db.$transaction((tx) => privacyCleanup(tx, projectId, e.message.id));
    await runAll();
    expect([...ports.google.docs.values()].some((t) => t.includes('1500円'))).toBe(false);
    expect(ports.line.sent).toHaveLength(sent);
  });
  it('rediscovers Google files after failure following external creation', async () => {
    const write = ports.google.writeDoc.bind(ports.google);
    let first = true;
    ports.google.writeDoc = async (...args) => {
      if (first) {
        first = false;
        throw new Error('failure after create');
      }
      return write(...args);
    };
    const job = await db.$transaction((tx) =>
      enqueue(tx, projectId, 'sync', `recovery:${projectId}`),
    );
    try {
      await expect(worker.run(job.id)).rejects.toThrow();
      expect(await db.document.count({ where: { projectId } })).toBe(0);
      const createdKeys = [...ports.google.files.keys()];
      await db.job.update({ where: { id: job.id }, data: { nextAt: new Date(0) } });
      await worker.run(job.id);
      expect(createdKeys.every((k) => ports.google.files.has(k))).toBe(true);
      expect(await db.document.count({ where: { projectId } })).toBe(2);
    } finally {
      ports.google.writeDoc = write;
    }
  });
});
