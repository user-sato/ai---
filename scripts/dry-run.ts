import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { ingest } from '../src/services/ingest.js';
import { Worker } from '../src/jobs.js';
import { scheduleReport } from '../src/services/reports.js';
import { mockPorts } from '../src/adapters/mock.js';
const c = loadConfig();
if (!c.DRY_RUN) throw new Error('Dry-run requires DRY_RUN=true');
const url = new URL(c.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('Dry-run requires an isolated localhost database');
const db = new PrismaClient();
const id = `demo-${randomUUID()}`;
const eventId = randomUUID();
const ports = mockPorts();
ports.ai.extract = async (messages) => ({
  items: [
    {
      kind: 'DECISION',
      title: '参加費1500円の提案',
      detail: '未承認の提案です',
      confidence: 0.9,
      evidence: [{ messageId: messages[0]!.id, quote: messages[0]!.body }],
    },
  ],
});
const worker = new Worker(db, c, ports, true);
try {
  await db.project.create({ data: { id, name: '合成データdry-run', groupId: id } });
  const time = new Date('2026-11-08T10:00:00Z');
  await ingest(db, {
    events: [
      {
        type: 'message',
        webhookEventId: eventId,
        timestamp: time.getTime(),
        source: { type: 'group', groupId: id, userId: 'synthetic-user' },
        message: { id: randomUUID(), type: 'text', text: '参加費1500円にしようかな' },
      },
    ],
  });
  await db.$transaction((tx) => scheduleReport(tx, id, 'weekly', new Date('2026-11-08T11:00:00Z')));
  // Only this demo's jobs; never drain another project's queue.
  for (let i = 0; i < 10; i++) {
    const jobs = await db.job.findMany({
      where: { projectId: id, status: 'PENDING', nextAt: { lte: new Date() } },
    });
    if (!jobs.length) break;
    for (const job of jobs) {
      await worker.prepareNotification(job.payload);
      await worker.run(job.id);
    }
  }
  const pendingCandidates = await db.item.count({ where: { projectId: id, status: 'PENDING' } });
  if (ports.google.docs.size !== 2 || ports.line.sent.length !== 1 || pendingCandidates !== 1) {
    throw new Error('Dry-run pipeline did not complete');
  }
  console.log(
    JSON.stringify({
      mockDocuments: ports.google.docs.size,
      mockNotifications: ports.line.sent.length,
      pendingCandidates: await db.item.count({ where: { projectId: id, status: 'PENDING' } }),
      externalCalls: 0,
    }),
  );
} finally {
  await db.evidence.deleteMany({ where: { item: { projectId: id } } });
  await db.item.deleteMany({ where: { projectId: id } });
  await db.message.deleteMany({ where: { projectId: id } });
  await db.analysisBatch.deleteMany({ where: { projectId: id } });
  await db.document.deleteMany({ where: { projectId: id } });
  await db.folder.deleteMany({ where: { projectId: id } });
  await db.job.deleteMany({ where: { projectId: id } });
  await db.report.deleteMany({ where: { projectId: id } });
  await db.notification.deleteMany({ where: { projectId: id } });
  await db.audit.deleteMany({ where: { projectId: id } });
  await db.eventReceipt.deleteMany({ where: { id: eventId } });
  await db.project.deleteMany({ where: { id } });
  await db.$disconnect();
}
