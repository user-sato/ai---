import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  docGet: vi.fn(),
  docUpdate: vi.fn(),
  sheetGet: vi.fn(),
  sheetUpdate: vi.fn(),
  clear: vi.fn(),
  values: vi.fn(),
}));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    options: vi.fn(),
    drive: () => ({ files: { list: api.list, create: api.create } }),
    docs: () => ({ documents: { get: api.docGet, batchUpdate: api.docUpdate } }),
    sheets: () => ({
      spreadsheets: {
        get: api.sheetGet,
        batchUpdate: api.sheetUpdate,
        values: { batchClear: api.clear, batchUpdate: api.values },
      },
    }),
  },
}));
import { GoogleAdapter } from '../src/adapters/google.js';
import { loadConfig } from '../src/config.js';
const config = loadConfig({
  DATABASE_URL: 'postgresql://localhost/test',
  INTERNAL_AUTH_MODE: 'local',
  INTERNAL_LOCAL_TOKEN: 'synthetic'.repeat(5),
});
let google: GoogleAdapter;
beforeEach(() => {
  vi.resetAllMocks();
  google = new GoogleAdapter(config);
});
describe('Google request contracts (SDK mocked)', () => {
  it('reuses a managed file by property and parent, without matching by display name', async () => {
    api.list.mockResolvedValue({
      data: {
        files: [
          {
            id: 'managed',
            mimeType: 'application/vnd.google-apps.document',
            webViewLink: 'https://docs.google.com/document/d/managed/edit',
          },
        ],
      },
    });
    const file = await google.ensureFile('a'.repeat(64), 'display-name', 'parent', 'doc');
    expect(file.id).toBe('managed');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.list.mock.calls[0]?.[0].q).toContain("'parent' in parents");
    expect(api.list.mock.calls[0]?.[0].q).toContain('appProperties has');
    expect(api.list.mock.calls[0]?.[0].q).not.toContain('display-name');
  });
  it('creates only private app-managed children and never changes permissions', async () => {
    api.list.mockResolvedValue({ data: { files: [] } });
    api.create.mockResolvedValue({ data: { id: 'new' } });
    await google.ensureFolder('b'.repeat(64), '2026-12', 'parent');
    expect(api.create.mock.calls[0]?.[0].requestBody).toEqual({
      name: '2026-12',
      parents: ['parent'],
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { secretaryKey: 'b'.repeat(64) },
    });
  });
  it('halts on duplicate management keys or incorrect MIME types', async () => {
    api.list.mockResolvedValue({ data: { files: [{ id: '1' }, { id: '2' }] } });
    await expect(google.ensureFile('c'.repeat(64), 'x', 'parent', 'doc')).rejects.toThrow(
      'Duplicate',
    );
    api.list.mockResolvedValue({ data: { files: [{ id: '1', mimeType: 'wrong' }] } });
    await expect(google.ensureFile('c'.repeat(64), 'x', 'parent', 'doc')).rejects.toThrow(
      'type mismatch',
    );
    expect(api.create).not.toHaveBeenCalled();
  });
  it('rejects malformed parent/key before any external call', async () => {
    await expect(google.ensureFolder('bad', 'name', "parent' or '1'='1")).rejects.toThrow();
    expect(api.list).not.toHaveBeenCalled();
  });
  it('preserves final newline and uses revision-guarded atomic Docs replacement', async () => {
    api.docGet.mockResolvedValue({
      data: { revisionId: 'r1', body: { content: [{ endIndex: 12 }] } },
    });
    api.docUpdate.mockResolvedValue({});
    await google.writeDoc('doc', 'new content');
    expect(api.docUpdate.mock.calls[0]?.[0].requestBody).toEqual({
      writeControl: { requiredRevisionId: 'r1' },
      requests: [
        { deleteContentRange: { range: { startIndex: 1, endIndex: 11 } } },
        { insertText: { location: { index: 1 }, text: 'new content' } },
      ],
    });
  });
  it('does not delete an invalid range in an empty Doc', async () => {
    api.docGet.mockResolvedValue({ data: { body: { content: [{ endIndex: 2 }] } } });
    api.docUpdate.mockResolvedValue({});
    await google.writeDoc('doc', 'text');
    expect(api.docUpdate.mock.calls[0]?.[0].requestBody.requests).toHaveLength(1);
  });
  it('writes Sheets with RAW mode to avoid formula evaluation, and clears stale rows', async () => {
    api.sheetGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Tasks' } }] } });
    api.sheetUpdate.mockResolvedValue({});
    api.clear.mockResolvedValue({});
    api.values.mockResolvedValue({});
    await google.writeSheet('sheet', {
      Tasks: [['title'], ['=IMPORTXML("malicious")']],
      Issues: [['id']],
    });
    expect(api.sheetUpdate.mock.calls[0]?.[0].requestBody.requests).toEqual([
      { addSheet: { properties: { title: 'Issues' } } },
    ]);
    expect(api.values.mock.calls[0]?.[0].requestBody.valueInputOption).toBe('RAW');
    expect(api.clear.mock.calls[0]?.[0].requestBody.ranges).toEqual([
      "'Tasks'!A:Z",
      "'Issues'!A:Z",
    ]);
  });
});
