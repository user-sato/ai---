import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { monthlyPeriod, weeklyPeriod, formatDate } from '../domain.js';
import { enqueue, type DB } from '../db.js';
import { SyncService, renderItems } from './sync.js';
import { queueNotification } from './commands.js';
export async function scheduleReport(
  db: DB,
  projectId: string,
  type: 'weekly' | 'monthly',
  now: Date,
) {
  const previous =
    type === 'weekly'
      ? await db.report.findFirst({ where: { projectId, type }, orderBy: { cutoffAt: 'desc' } })
      : null;
  const computed = type === 'weekly' ? weeklyPeriod(now) : monthlyPeriod(now);
  if (previous && previous.cutoffAt >= computed.end) return;
  const period = type === 'weekly' ? weeklyPeriod(now, previous?.cutoffAt) : computed;
  if (period.start >= period.end) return;
  const report = await db.report.upsert({
    where: {
      projectId_type_periodStart_periodEnd: {
        projectId,
        type,
        periodStart: period.start,
        periodEnd: period.end,
      },
    },
    create: {
      projectId,
      type,
      periodStart: period.start,
      periodEnd: period.end,
      cutoffAt: period.end,
      folderMonth: period.folderMonth,
    },
    update: {},
  });
  await enqueue(db, projectId, 'report', `report:${report.id}`, { reportId: report.id });
}
export async function generateReport(
  db: DB,
  sync: SyncService,
  projectId: string,
  reportId: string,
  rebuild = false,
) {
  const report = await db.report.findFirstOrThrow({ where: { id: reportId, projectId } });
  if (report.status === 'READY' && !rebuild) return;
  const messages = await db.message.findMany({
    where: {
      projectId,
      withdrawn: false,
      command: false,
      ...(report.type === 'weekly'
        ? { sentAt: { lt: report.periodEnd }, weeklyReportId: rebuild ? report.id : null }
        : { sentAt: { gte: report.periodStart, lt: report.periodEnd } }),
    },
    orderBy: { sentAt: 'asc' },
  });
  if (!messages.length) {
    await db.report.update({ where: { id: report.id }, data: { status: 'EMPTY' } });
    if (!rebuild) return;
  }
  const { items, sheetUrl } = await sync.current();
  const ids = new Set(messages.map((m) => m.id));
  const changed = items.filter(
    (i) =>
      i.evidence.some((e) => ids.has(e.messageId)) ||
      (i.updatedAt >= report.periodStart && i.updatedAt < report.periodEnd),
  );
  const previous = await db.report.findFirst({
    where: { projectId, type: report.type, cutoffAt: { lt: report.cutoffAt }, status: 'READY' },
    orderBy: { cutoffAt: 'desc' },
  });
  const previousSnapshot = previous?.snapshot as { itemIds?: string[] } | null;
  const priorIds = new Set(previousSnapshot?.itemIds ?? []);
  const newCount = changed.filter((i) => !priorIds.has(i.id)).length;
  const confirmed = items.filter(
    (i) =>
      i.kind === 'DECISION' &&
      i.status === 'CONFIRMED' &&
      i.confirmedAt &&
      i.confirmedAt >= report.periodStart &&
      i.confirmedAt < report.periodEnd,
  ).length;
  const pending = items.filter((i) => i.status === 'PENDING').length;
  const open = items.filter(
    (i) => ['TASK', 'ISSUE'].includes(i.kind) && i.status === 'OPEN',
  ).length;
  const late = messages.filter((m) => m.sentAt < report.periodStart).length;
  const heading = `${report.type === 'weekly' ? '週次レポート（速報版・連続締切）' : '月次まとめ'}\n対象: ${formatDate(report.periodStart)} 〜 ${formatDate(report.periodEnd)} JST（終端排他）\n集計締切: ${formatDate(report.cutoffAt)} JST\n発言: ${messages.length}件（うち期間前の遅延到着: ${late}件） / 新規確定: ${confirmed}件 / 確認待ち: ${pending}件 / 未解決: ${open}件\n前回にない抽出項目: ${newCount}件\n状態表示は文書生成時点です。確定・更新日時を各項目に表示します。\n`;
  const evidenceDates = messages.map((m) => `${m.id}: ${formatDate(m.sentAt)} JST`).join('\n');
  let text =
    heading +
    '\n' +
    renderItems('対象期間の変更・根拠', changed) +
    '\n\n' +
    renderItems(
      '現在の持越し・確認待ち',
      items.filter((i) => ['OPEN', 'PENDING'].includes(i.status)),
    ) +
    '\n\n根拠発言日時\n' +
    evidenceDates;
  if (report.type === 'monthly') {
    const weekly = await db.report.findMany({
      where: { projectId, type: 'weekly', folderMonth: report.folderMonth, status: 'READY' },
      orderBy: { cutoffAt: 'asc' },
    });
    text += '\n\n関連週次レポート\n' + weekly.map((w) => w.documentUrl).join('\n');
  }
  const folder = await sync.monthFolder(report.folderMonth, report.type === 'weekly');
  const title =
    report.type === 'weekly'
      ? `${DateTime.fromJSDate(report.periodEnd, { zone: 'Asia/Tokyo' }).toFormat('yyyy-MM-dd')}_週次レポート`
      : `${report.folderMonth}_月次まとめ`;
  const url = await sync.document(`report:${report.id}`, title, folder, text);
  if (report.type === 'weekly')
    await db.message.updateMany({
      where: { projectId, id: { in: messages.map((m) => m.id) } },
      data: { weeklyReportId: report.id },
    });
  await db.report.update({
    where: { id: report.id },
    data: {
      status: messages.length ? 'READY' : 'EMPTY',
      documentUrl: url,
      snapshot: { itemIds: items.map((i) => i.id), counts: { confirmed, pending, open }, text },
    },
  });
  const highlights =
    changed
      .filter((i) => !['REJECTED', 'SUPERSEDED'].includes(i.status))
      .slice(0, 3)
      .map((i) => `・[${i.status}] ${i.title}`)
      .join('\n') || '期間内の新規抽出はありません。';
  if (report.type === 'weekly' && messages.length && !rebuild)
    await queueNotification(
      db,
      projectId,
      `report:${report.id}`,
      `【AI書記｜週次レポート】\n対象: ${formatDate(report.periodStart)} 〜 ${formatDate(report.periodEnd)} JST（終端排他）\n新規確定: ${confirmed}件 / 確認待ち: ${pending}件 / 未解決: ${open}件\n今週の要点\n${highlights}\n進捗は報告された内容のみ記録しています。\n詳細議事録: ${url}\nタスク・残課題: ${sheetUrl}`,
    );
}
export async function privacyCleanup(db: DB, projectId: string, messageId: string) {
  const affected = await db.evidence.findMany({
    where: { messageId, item: { projectId } },
    select: { itemId: true },
  });
  await db.item.deleteMany({ where: { projectId, id: { in: affected.map((e) => e.itemId) } } });
  await db.message.updateMany({
    where: { id: messageId, projectId },
    data: { body: '', withdrawn: true, userId: null },
  });
  await db.notification.updateMany({
    where: { projectId, status: 'PENDING' },
    data: { status: 'CANCELLED', text: '削除要求により取消' },
  });
  const reports = await db.report.findMany({ where: { projectId } });
  for (const r of reports) {
    await db.report.update({ where: { id: r.id }, data: { snapshot: Prisma.DbNull } });
    await enqueue(db, projectId, 'report', `privacy:${messageId}:report:${r.id}`, {
      reportId: r.id,
      rebuild: true,
    });
  }
  await enqueue(db, projectId, 'sync', `privacy:${messageId}:sync`);
}
