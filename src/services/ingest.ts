import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { enqueue } from '../db.js';
const eventSchema = z.object({
  webhookEventId: z.string().min(1),
  type: z.string(),
  timestamp: z.number().int().nonnegative(),
  source: z.object({
    type: z.string(),
    groupId: z.string().optional(),
    userId: z.string().optional(),
  }),
  message: z
    .object({ id: z.string(), type: z.string(), text: z.string().max(10000).optional() })
    .optional(),
  unsend: z.object({ messageId: z.string() }).optional(),
});
export const webhookSchema = z.object({
  destination: z.string().optional(),
  events: z.array(eventSchema).max(1000),
});
export async function ingest(prisma: PrismaClient, body: unknown) {
  const { events } = webhookSchema.parse(body);
  await prisma.$transaction(async (db) => {
    for (const e of events) {
      if (e.source.type !== 'group' || !e.source.groupId) continue;
      const project = await db.project.findUnique({ where: { groupId: e.source.groupId } });
      if (!project?.enabled) continue;
      const receipt = await db.eventReceipt.createMany({
        data: [{ id: e.webhookEventId }],
        skipDuplicates: true,
      });
      if (!receipt.count) continue;
      if (e.type === 'unsend' && e.unsend) {
        // Preserve the tombstone even when the unsend arrives before its message.
        const existing = await db.message.findUnique({ where: { id: e.unsend.messageId } });
        if (existing && existing.projectId !== project.id) continue;
        await db.message.upsert({
          where: { id: e.unsend.messageId },
          create: {
            id: e.unsend.messageId,
            eventId: `unsend:${e.unsend.messageId}`,
            projectId: project.id,
            body: '',
            sentAt: new Date(e.timestamp),
            withdrawn: true,
          },
          update: { withdrawn: true, body: '' },
        });
        await enqueue(db, project.id, 'privacy', `privacy:${e.webhookEventId}`, {
          messageId: e.unsend.messageId,
        });
      }
      if (e.type === 'message' && e.message?.type === 'text' && e.message.text) {
        const command = e.message.text.startsWith('/bot');
        const inserted = await db.message.createMany({
          data: [
            {
              id: e.message.id,
              eventId: e.webhookEventId,
              projectId: project.id,
              userId: e.source.userId,
              body: e.message.text,
              sentAt: new Date(e.timestamp),
              command,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count) {
          if (command)
            await enqueue(db, project.id, 'command', `command:${e.message.id}`, {
              messageId: e.message.id,
            });
          else {
            const bucket = Math.floor(Date.now() / 300000);
            const job = await enqueue(
              db,
              project.id,
              'analyze',
              `analysis:${project.id}:${bucket}`,
            );
            await db.job.update({
              where: { id: job.id },
              data: { nextAt: new Date((bucket + 1) * 300000) },
            });
          }
        }
      }
      if (e.type === 'leave') {
        await db.project.update({ where: { id: project.id }, data: { enabled: false } });
        await db.notification.updateMany({
          where: { projectId: project.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
    }
  });
}
