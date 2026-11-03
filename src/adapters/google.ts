import { google, type drive_v3, type docs_v1, type sheets_v4 } from 'googleapis';
import type { Google } from '../ports.js';
import type { Config } from '../config.js';
export class GoogleAdapter implements Google {
  private drive: drive_v3.Drive;
  private docs: docs_v1.Docs;
  private sheets: sheets_v4.Sheets;
  constructor(config: Config) {
    const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
    google.options({ timeout: 30_000, retry: false });
    this.drive = google.drive({ version: 'v3', auth });
    this.docs = google.docs({ version: 'v1', auth });
    this.sheets = google.sheets({ version: 'v4', auth });
  }
  private async ensure(key: string, name: string, parent: string, mimeType: string) {
    // key and parent come only from hashed internal keys / validated Google IDs.
    if (!/^[a-zA-Z0-9_-]+$/.test(parent) || !/^[a-f0-9]{64}$/.test(key))
      throw new Error('Invalid managed file identifier');
    const existing = await this.drive.files.list({
      q: `trashed = false and '${parent}' in parents and appProperties has { key='secretaryKey' and value='${key}' }`,
      fields: 'files(id,mimeType,webViewLink)',
      pageSize: 100,
    });
    const files = existing.data.files ?? [];
    if (files.length > 1) throw new Error('Duplicate managed files require review');
    if (files[0]) {
      if (files[0].mimeType !== mimeType) throw new Error('Managed file type mismatch');
      return files[0];
    }
    const result = await this.drive.files.create({
      requestBody: { name, parents: [parent], mimeType, appProperties: { secretaryKey: key } },
      fields: 'id,webViewLink,mimeType',
    });
    return result.data;
  }
  async ensureFolder(key: string, name: string, parent: string) {
    const f = await this.ensure(key, name, parent, 'application/vnd.google-apps.folder');
    if (!f.id) throw new Error('Missing folder ID');
    return f.id;
  }
  async ensureFile(key: string, name: string, parent: string, kind: 'doc' | 'sheet') {
    const f = await this.ensure(
      key,
      name,
      parent,
      kind === 'doc'
        ? 'application/vnd.google-apps.document'
        : 'application/vnd.google-apps.spreadsheet',
    );
    if (!f.id) throw new Error('Missing file ID');
    return {
      id: f.id,
      url:
        f.webViewLink ??
        `https://docs.google.com/${kind === 'doc' ? 'document' : 'spreadsheets'}/d/${f.id}/edit`,
    };
  }
  async writeDoc(id: string, text: string) {
    const d = await this.docs.documents.get({ documentId: id });
    const end = d.data.body?.content?.at(-1)?.endIndex ?? 1;
    const requests: docs_v1.Schema$Request[] = [];
    if (end > 2)
      requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } });
    requests.push({ insertText: { location: { index: 1 }, text } });
    await this.docs.documents.batchUpdate({
      documentId: id,
      requestBody: {
        writeControl: d.data.revisionId ? { requiredRevisionId: d.data.revisionId } : undefined,
        requests,
      },
    });
  }
  async writeSheet(id: string, tabs: Record<string, string[][]>) {
    const existing = await this.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties',
    });
    const names = new Set(existing.data.sheets?.map((s) => s.properties?.title));
    const missing = Object.keys(tabs).filter((n) => !names.has(n));
    if (missing.length)
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
        },
      });
    // Clearing the four Bot-owned tabs is intentional: removes resolved/deleted rows.
    await this.sheets.spreadsheets.values.batchClear({
      spreadsheetId: id,
      requestBody: { ranges: Object.keys(tabs).map((n) => `'${n}'!A:Z`) },
    });
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: 'RAW',
        data: Object.entries(tabs).map(([n, values]) => ({ range: `'${n}'!A1`, values })),
      },
    });
  }
}
