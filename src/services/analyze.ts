import { DateTime } from 'luxon';
import { validateExtraction, fingerprint } from '../domain.js';
import { audit, enqueue, type DB } from '../db.js';
import type { Config } from '../config.js';
import type { AI } from '../ports.js';
import { PROMPT_VERSION } from '../adapters/openai.js';
export async function analyze(db: DB, projectId: string, ai: AI, c: Config) {
  const pending = await db.message.findMany({
    where: { projectId, withdrawn: false, command: false, analyzedAt: null },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    take: c.MAX_ANALYSIS_MESSAGES,
  });
  const messages: typeof pending = [];
  let chars = 0;
  for (const message of pending) {
    if (messages.length && chars + message.body.length > 25000) break;
    messages.push(message);
    chars += message.body.length;
  }
  if (!messages.length) return;
  const context = await db.item.findMany({
    where: { projectId },
    select: { id: true, kind: true, title: true, detail: true, status: true },
    take: 50,
    orderBy: { updatedAt: 'desc' },
  });
  const extraction = validateExtraction(
    await ai.extract(
      messages,
      JSON.stringify(context.map((i) => ({ ...i, detail: i.detail.slice(0, 300) }))).slice(
        0,
        24000,
      ),
    ),
    messages,
  );
  const batch = await db.analysisBatch.create({
    data: {
      projectId,
      messageIds: messages.map((m) => m.id),
      model: c.OPENAI_MODEL || 'mock',
      promptVersion: PROMPT_VERSION,
    },
  });
  for (const candidate of extraction.items) {
    const item = await db.item.upsert({
      where: {
        projectId_kind_fingerprint: {
          projectId,
          kind: candidate.kind,
          fingerprint: fingerprint(candidate.title),
        },
      },
      create: {
        projectId,
        kind: candidate.kind,
        title: candidate.title,
        detail: candidate.detail,
        status: candidate.kind === 'ISSUE' ? 'OPEN' : 'PENDING',
        fingerprint: fingerprint(candidate.title),
      },
      update: {},
    });
    await db.evidence.createMany({
      data: candidate.evidence.map((e) => ({
        itemId: item.id,
        messageId: e.messageId,
        quote: e.quote,
      })),
      skipDuplicates: true,
    });
    await audit(db, projectId, 'ai', 'EXTRACTED', item.id, {
      batchId: batch.id,
      confidence: candidate.confidence,
    });
  }
  await db.message.updateMany({
    where: { id: { in: messages.map((m) => m.id) } },
    data: { analyzedAt: new Date() },
  });
  for (const month of new Set(
    messages.map((m) => DateTime.fromJSDate(m.sentAt, { zone: 'Asia/Tokyo' }).toFormat('yyyy-MM')),
  ))
    await enqueue(db, projectId, 'rollover', `rollover:${projectId}:${month}`, { month });
  await enqueue(db, projectId, 'sync', `sync:batch:${batch.id}`);
}
