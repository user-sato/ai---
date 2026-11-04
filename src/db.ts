import { Prisma, PrismaClient } from '@prisma/client';
export type DB = Prisma.TransactionClient;
export const prisma = new PrismaClient({ log: [] });
export async function enqueue(
  db: DB,
  projectId: string,
  type: string,
  key: string,
  payload: Prisma.InputJsonValue = {},
) {
  return db.job.upsert({ where: { key }, create: { projectId, type, key, payload }, update: {} });
}
export async function audit(
  db: DB,
  projectId: string,
  actor: string,
  action: string,
  targetId: string,
  metadata: Prisma.InputJsonValue = {},
) {
  await db.audit.create({ data: { projectId, actor, action, targetId, metadata } });
}
