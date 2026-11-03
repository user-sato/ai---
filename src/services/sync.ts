import type { Item, Evidence } from '@prisma/client';
import { formatDate, hash } from '../domain.js';
import type { DB } from '../db.js';
import type { Google } from '../ports.js';
type ItemWithEvidence = Item & { evidence: Evidence[] };
export class SyncService {
  constructor(
    private db: DB,
    private google: Google,
    private projectId: string,
    private root: string,
  ) {}
  private key(k: string) {
    return hash(`line-secretary:${this.projectId}:${k}`);
  }
  private async folder(key: string, name: string, parent: string) {
    const found = await this.db.folder.findUnique({
      where: { projectId_key: { projectId: this.projectId, key } },
    });
    if (found) return found.googleId;
    const id = await this.google.ensureFolder(this.key(key), name, parent);
    await this.db.folder.create({ data: { projectId: this.projectId, key, googleId: id } });
    return id;
  }
  async projectFolder() {
    const p = await this.db.project.findUniqueOrThrow({ where: { id: this.projectId } });
    return this.folder('project', p.name, this.root);
  }
  async monthFolder(month: string, weekly = false) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid folder month');
    const project = await this.projectFolder();
    const year = await this.folder(month.slice(0, 4), month.slice(0, 4), project);
    const folder = await this.folder(month, month, year);
    return weekly ? this.folder(`${month}/weekly`, '週次レポート', folder) : folder;
  }
  async document(key: string, name: string, parent: string, text: string) {
    let doc = await this.db.document.findUnique({
      where: { projectId_key: { projectId: this.projectId, key } },
    });
    if (!doc) {
      const file = await this.google.ensureFile(this.key(key), name, parent, 'doc');
      doc = await this.db.document.create({
        data: { projectId: this.projectId, key, googleId: file.id, url: file.url },
      });
    }
    const contentHash = hash(text);
    if (doc.hash !== contentHash) {
      await this.google.writeDoc(doc.googleId, text);
      await this.db.document.update({
        where: { id: doc.id },
        data: { hash: contentHash, revision: { increment: 1 }, syncedAt: new Date() },
      });
    }
    return doc.url;
  }
  async current() {
    const items = await this.db.item.findMany({
      where: { projectId: this.projectId },
      include: { evidence: true },
      orderBy: { createdAt: 'asc' },
    });
    const folder = await this.projectFolder();
    const text = renderItems('プロジェクト現況書', items);
    await this.document('current', '00_プロジェクト現況書', folder, text);
    let sheet = await this.db.document.findUnique({
      where: { projectId_key: { projectId: this.projectId, key: 'tasks' } },
    });
    if (!sheet) {
      const file = await this.google.ensureFile(
        this.key('tasks'),
        '00_タスク・課題管理',
        folder,
        'sheet',
      );
      sheet = await this.db.document.create({
        data: { projectId: this.projectId, key: 'tasks', googleId: file.id, url: file.url },
      });
    }
    const rows = (kind: string) => [
      [
        '内部ID',
        '状態',
        '件名',
        '内容',
        '担当(未確定は空)',
        '期限',
        '更新日時',
        '根拠メッセージID',
        '管理方針',
      ],
      ...items
        .filter((i) => i.kind === kind)
        .map((i) => [
          i.id,
          i.status,
          i.title,
          i.detail,
          i.assigneeUserId ?? '',
          i.dueAt ? formatDate(i.dueAt) : '',
          formatDate(i.updatedAt),
          i.evidence.map((e) => e.messageId).join(', '),
          'Bot管理・手動編集は同期で上書き',
        ]),
    ];
    const tabs = {
      Tasks: rows('TASK'),
      Issues: rows('ISSUE'),
      Decisions: [
        ...rows('DECISION'),
        ...items
          .filter((i) => i.kind === 'CHANGE')
          .map((i) => [
            i.id,
            '変更候補: ' + i.status,
            i.title,
            i.detail,
            '',
            '',
            formatDate(i.updatedAt),
            i.evidence.map((e) => e.messageId).join(', '),
          ]),
      ],
      SyncStatus: [
        ['状態', '内容'],
        ['管理', 'DBが正本。手動編集は次回同期で上書き'],
        ['同期', 'SUCCESS'],
        ['件数', String(items.length)],
      ],
    };
    const contentHash = hash(JSON.stringify(tabs));
    if (sheet.hash !== contentHash) {
      await this.google.writeSheet(sheet.googleId, tabs);
      await this.db.document.update({
        where: { id: sheet.id },
        data: { hash: contentHash, revision: { increment: 1 }, syncedAt: new Date() },
      });
    }
    return { items, sheetUrl: sheet.url };
  }
}
export function renderItems(title: string, items: ItemWithEvidence[]) {
  const updated = items.length
    ? new Date(Math.max(...items.map((i) => i.updatedAt.getTime())))
    : null;
  return (
    `${title}\nBot管理・手動編集は次回同期で上書きされる可能性があります。DBが正本です。\n最終データ更新: ${updated ? formatDate(updated) : 'データなし'}\n担当者・期限は未確認。進捗の報告がなければ進捗不明です。\n\n` +
    ['DECISION', 'TASK', 'ISSUE', 'CHANGE']
      .map(
        (kind) =>
          `${{ DECISION: '決定事項/決定候補', TASK: 'タスク', ISSUE: '未解決課題', CHANGE: '矛盾・変更候補' }[kind]}\n` +
          items
            .filter((i) => i.kind === kind)
            .map(
              (i) =>
                `[${i.status}] ${i.title} (ID: ${i.id})\n${i.detail}\n状態更新: ${formatDate(i.updatedAt)} JST${i.confirmedAt ? ` / 確定: ${formatDate(i.confirmedAt)} JST` : ''}\n根拠: ${i.evidence.map((e) => `${e.messageId}:「${e.quote}」`).join(' / ')}`,
            )
            .join('\n\n'),
      )
      .join('\n\n')
  );
}
