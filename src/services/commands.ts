import { audit, enqueue, type DB } from '../db.js';
import type { Config } from '../config.js';
export async function queueNotification(db: DB, projectId: string, key: string, text: string) {
  const notification = await db.notification.upsert({
    where: { key },
    create: { projectId, key, text: text.slice(0, 4900) },
    update: {},
  });
  await enqueue(db, projectId, 'notify', `notify:${notification.id}`, {
    notificationId: notification.id,
  });
}
export async function command(db: DB, projectId: string, messageId: string, c: Config) {
  const message = await db.message.findFirst({
    where: { id: messageId, projectId, withdrawn: false },
  });
  if (!message) return;
  const parts = message.body.trim().split(/\s+/u);
  const verb = parts[1];
  const id = parts[2];
  let response =
    'コマンド: /bot 決定事項・残課題・確認待ち・今週・承認 <ID>・却下 <ID>・完了 <ID>・解決 <ID>';
  if (['承認', '却下', '完了', '解決'].includes(verb ?? '')) {
    const admins = c.LINE_ADMIN_USER_IDS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!message.userId || !admins.includes(message.userId))
      response = 'この操作には管理者権限が必要です。';
    else {
      const item = id ? await db.item.findFirst({ where: { id, projectId } }) : null;
      if (!item) response = '対象IDが見つかりません。';
      else {
        let status: string | undefined;
        if (verb === '承認' && item.status === 'PENDING' && item.kind !== 'CHANGE')
          status = item.kind === 'DECISION' ? 'CONFIRMED' : 'OPEN';
        if (verb === '却下' && item.status === 'PENDING') status = 'REJECTED';
        if (verb === '完了' && item.kind === 'TASK' && item.status === 'OPEN') status = 'DONE';
        if (verb === '解決' && item.kind === 'ISSUE' && item.status === 'OPEN') status = 'RESOLVED';
        if (!status)
          response = 'この状態では操作できません。変更候補は自動で既存事項へ適用しません。';
        else {
          await db.item.update({
            where: { id: item.id },
            data: {
              status,
              version: { increment: 1 },
              confirmedAt: status === 'CONFIRMED' ? new Date() : item.confirmedAt,
            },
          });
          await audit(db, projectId, message.userId, verb!, item.id, {
            before: item.status,
            after: status,
          });
          await enqueue(db, projectId, 'sync', `sync:command:${messageId}`);
          response = `${item.id}: ${status} に更新しました。`;
        }
      }
    }
  } else if (verb === '今週') {
    const report = await db.report.findFirst({
      where: { projectId, type: 'weekly', status: 'READY' },
      orderBy: { cutoffAt: 'desc' },
    });
    response = report?.documentUrl
      ? `最新週次レポート: ${report.documentUrl}`
      : '週次レポートはまだありません。';
  } else if (['決定事項', '残課題', '確認待ち'].includes(verb ?? '')) {
    const items = await db.item.findMany({
      where: {
        projectId,
        ...(verb === '決定事項'
          ? { kind: 'DECISION', status: 'CONFIRMED' }
          : verb === '確認待ち'
            ? { status: 'PENDING' }
            : { kind: { in: ['TASK', 'ISSUE'] }, status: 'OPEN' }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    });
    response = items.length
      ? items.map((i) => `[${i.status}] ${i.title}\nID: ${i.id}`).join('\n\n')
      : '該当項目はありません。';
    const sheet = await db.document.findUnique({
      where: { projectId_key: { projectId, key: 'tasks' } },
    });
    if (sheet) response += `\n\nタスク・課題管理: ${sheet.url}`;
  }
  await queueNotification(db, projectId, `command:${messageId}`, response);
}
