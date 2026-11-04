import { hash } from '../domain.js';
import type { Ports, Google, AI, Line } from '../ports.js';
export class MockGoogle implements Google {
  files = new Map<string, { id: string; url: string }>();
  docs = new Map<string, string>();
  sheets = new Map<string, Record<string, string[][]>>();
  fail = false;
  async ensureFolder(key: string, _name: string, _parent: string) {
    if (this.fail) throw new Error('Mock Google unavailable');
    const id = 'mock-' + hash(key).slice(0, 20);
    this.files.set(key, { id, url: `https://example.invalid/${id}` });
    return id;
  }
  async ensureFile(key: string, _name: string, _parent: string, _kind: 'doc' | 'sheet') {
    const id = await this.ensureFolder(key, _name, _parent);
    return { id, url: `https://example.invalid/${id}` };
  }
  async writeDoc(id: string, text: string) {
    if (this.fail) throw new Error('Mock Google unavailable');
    this.docs.set(id, text);
  }
  async writeSheet(id: string, tabs: Record<string, string[][]>) {
    if (this.fail) throw new Error('Mock Google unavailable');
    this.sheets.set(id, tabs);
  }
}
export class MockLine implements Line {
  sent: { groupId: string; text: string; retryKey: string }[] = [];
  async push(groupId: string, text: string, retryKey: string) {
    if (!this.sent.some((s) => s.retryKey === retryKey))
      this.sent.push({ groupId, text, retryKey });
  }
}
export function mockPorts(): Ports & { google: MockGoogle; line: MockLine } {
  const ai: AI = { extract: async () => ({ items: [] }) };
  return { ai, google: new MockGoogle(), line: new MockLine() };
}
