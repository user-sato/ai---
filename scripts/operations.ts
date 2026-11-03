import 'dotenv/config';
import { prisma } from '../src/db.js';
import { audit, enqueue } from '../src/db.js';
// DB-only recovery. No external calls. This does not bypass DRY_RUN or consent gates.
const [action, projectId, id] = process.argv.slice(2);
try {
  if (!projectId)
    throw new Error('Usage: operations.ts status|retry|withdraw PROJECT_ID [JOB_ID|MESSAGE_ID]');
  await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (action === 'status') {
    const jobs = await prisma.job.groupBy({ by: ['status'], where: { projectId }, _count: true });
    const notifications = await prisma.notification.groupBy({
      by: ['status'],
      where: { projectId },
      _count: true,
    });
    console.log(JSON.stringify({ jobs, notifications }));
  } else if (action === 'retry' && id) {
    await prisma.$transaction(async (db) => {
      const job = await db.job.findFirstOrThrow({ where: { id, projectId, status: 'FAILED' } });
      if (job.type === 'notify')
        throw new Error(
          'Notification retries require delivery/retry-key age review; use operations runbook',
        );
      await db.job.update({
        where: { id },
        data: { status: 'PENDING', attempts: 0, nextAt: new Date(), lastError: null },
      });
      await audit(db, projectId, 'operator', 'RETRY_JOB', id);
    });
    console.log('Job requeued.');
  } else if (action === 'withdraw' && id) {
    await prisma.$transaction(async (db) => {
      await db.message.findFirstOrThrow({ where: { id, projectId } });
      await db.message.update({ where: { id }, data: { body: '', userId: null, withdrawn: true } });
      await enqueue(db, projectId, 'privacy', `privacy:operator:${id}`, { messageId: id });
      await audit(db, projectId, 'operator', 'WITHDRAW_REQUESTED', id);
    });
    console.log('Message withdrawn; derived output cleanup queued.');
  } else throw new Error('Invalid operation');
} finally {
  await prisma.$disconnect();
}
