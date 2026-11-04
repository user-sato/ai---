import { DateTime } from 'luxon';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Config } from './config.js';
import type { Ports } from './ports.js';
import { audit, enqueue, type DB } from './db.js';
import { safeError, retryDelay } from './domain.js';
import { analyze } from './services/analyze.js';
import { command } from './services/commands.js';
import { SyncService } from './services/sync.js';
import { scheduleReport, generateReport, privacyCleanup } from './services/reports.js';
export class Worker {
  constructor(
    private prisma: PrismaClient,
    private c: Config,
    private ports: Ports,
    private allowMockPersistence = false,
  ) {}
  async run(jobId: string) {
    if (this.c.DRY_RUN && !this.allowMockPersistence)
      throw new Error('Dry-run worker disabled: use isolated dry-run script');
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'PENDING' || job.nextAt > new Date()) return;
    try {
      await this.prisma.$transaction(
        async (db) => {
          const [lock] = await db.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(hashtextextended(${job.projectId}, 0)) AS locked`;
          if (!lock?.locked) return;
          const latest = await db.job.findUniqueOrThrow({ where: { id: jobId } });
          if (latest.status !== 'PENDING' || latest.nextAt > new Date()) return;
          const project = await db.project.findUnique({ where: { id: job.projectId } });
          if (!project?.enabled && job.type !== 'privacy') {
            await db.job.update({ where: { id: jobId }, data: { status: 'CANCELLED' } });
            return;
          }
          const payload = job.payload as Record<string, string | boolean>;
          const sync = new SyncService(
            db,
            this.ports.google,
            job.projectId,
            this.c.GOOGLE_DRIVE_ROOT_ID || 'mock-root',
          );
          if (job.type === 'analyze') await analyze(db, job.projectId, this.ports.ai, this.c);
          else if (job.type === 'command')
            await command(db, job.projectId, String(payload.messageId), this.c);
          else if (job.type === 'sync') await sync.current();
          else if (job.type === 'rollover') await sync.monthFolder(String(payload.month));
          else if (job.type === 'report') {
            const report = await db.report.findUniqueOrThrow({
              where: { id: String(payload.reportId) },
            });
            const earlier = await db.report.count({
              where: {
                projectId: job.projectId,
                type: report.type,
                cutoffAt: { lt: report.cutoffAt },
                status: 'PENDING',
              },
            });
            if (earlier) {
              await db.job.update({
                where: { id: jobId },
                data: { nextAt: new Date(Date.now() + 60_000) },
              });
              return;
            }
            // Catch up extraction first, without sending incomplete weekly notifications.
            const remaining = await db.message.count({
              where: {
                projectId: job.projectId,
                command: false,
                withdrawn: false,
                analyzedAt: null,
              },
            });
            if (remaining) {
              await analyze(db, job.projectId, this.ports.ai, this.c);
              const after = await db.message.count({
                where: {
                  projectId: job.projectId,
                  command: false,
                  withdrawn: false,
                  analyzedAt: null,
                },
              });
              if (after) {
                await db.job.update({
                  where: { id: jobId },
                  data: { nextAt: new Date(Date.now() + 1000) },
                });
                return;
              }
            }
            await generateReport(
              db,
              sync,
              job.projectId,
              String(payload.reportId),
              payload.rebuild === true,
            );
          } else if (job.type === 'notify')
            await this.notify(db, job.projectId, String(payload.notificationId));
          else if (job.type === 'privacy') {
            await privacyCleanup(db, job.projectId, String(payload.messageId));
            await audit(db, job.projectId, 'system', 'PRIVACY_CLEANUP', String(payload.messageId));
          } else throw new Error('Unknown job type');
          await db.job.update({
            where: { id: jobId },
            data: { status: 'DONE', completedAt: new Date(), lastError: null },
          });
        },
        { timeout: 240_000, maxWait: 5000 },
      );
    } catch (error) {
      // Update only if still pending: a successful concurrent retry must not be reverted.
      const current = await this.prisma.job.findUnique({ where: { id: jobId } });
      if (current?.status === 'PENDING')
        await this.prisma.job.updateMany({
          where: { id: jobId, status: 'PENDING' },
          data: {
            attempts: { increment: 1 },
            nextAt: new Date(Date.now() + retryDelay(current.attempts)),
            lastError: safeError(error),
            status: current.attempts >= 9 ? 'FAILED' : 'PENDING',
          },
        });
      throw new Error(safeError(error));
    }
  }
  private async notify(db: DB, projectId: string, id: string) {
    const n = await db.notification.findFirst({ where: { id, projectId } });
    if (!n || n.status !== 'PENDING') return;
    if (!n.firstAttemptAt) throw new Error('Notification attempt must be durably prepared');
    if (Date.now() - n.firstAttemptAt.getTime() >= 23 * 3600_000) {
      await db.notification.update({ where: { id }, data: { status: 'REVIEW_REQUIRED' } });
      await audit(db, projectId, 'system', 'NOTIFICATION_REVIEW_REQUIRED', id);
      return;
    }
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    await this.ports.line.push(project.groupId, n.text, n.retryKey);
    await db.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
  }
  async drain(limit = 30) {
    const jobs = await this.prisma.job.findMany({
      where: { status: 'PENDING', nextAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let failed = 0;
    for (const job of jobs) {
      if (job.type === 'notify') await this.prepareNotification(job.payload);
      try {
        if (this.ports.queue) await this.ports.queue.enqueue(job.id);
        else await this.run(job.id);
      } catch {
        failed++;
      }
    }
    return { queued: jobs.length, failed };
  }
  async prepareNotification(payload: Prisma.JsonValue) {
    const id = (payload as { notificationId?: string })?.notificationId;
    if (id)
      await this.prisma.notification.updateMany({
        where: { id, firstAttemptAt: null, status: 'PENDING' },
        data: { firstAttemptAt: new Date() },
      });
  }
}
export async function schedule(prisma: PrismaClient, type: string, now: Date) {
  const projects = await prisma.project.findMany({ where: { enabled: true } });
  for (const p of projects)
    await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${p.id},0))`;
      if (type === 'weekly-report' || type === 'monthly-report')
        await scheduleReport(db, p.id, type === 'weekly-report' ? 'weekly' : 'monthly', now);
      else if (type === 'monthly-rollover') {
        const month = DateTime.fromJSDate(now, { zone: 'Asia/Tokyo' }).toFormat('yyyy-MM');
        await enqueue(db, p.id, 'rollover', `rollover:${p.id}:${month}`, { month });
      } else if (type === 'daily-reconcile') {
        const day = DateTime.fromJSDate(now, { zone: 'Asia/Tokyo' }).toISODate();
        await enqueue(db, p.id, 'sync', `reconcile:${p.id}:${day}`);
      } else if (type === 'analyze') {
        await enqueue(
          db,
          p.id,
          'analyze',
          `analysis:${p.id}:${Math.floor(now.getTime() / 300000)}`,
        );
      } else throw new Error('Unknown schedule');
    });
}
