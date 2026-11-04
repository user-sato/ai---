import type { Extraction, Source } from './domain.js';
export interface AI {
  extract(messages: Source[], context: string): Promise<Extraction>;
}
export interface Google {
  ensureFolder(key: string, name: string, parent: string): Promise<string>;
  ensureFile(
    key: string,
    name: string,
    parent: string,
    kind: 'doc' | 'sheet',
  ): Promise<{ id: string; url: string }>;
  writeDoc(id: string, text: string): Promise<void>;
  writeSheet(id: string, tabs: Record<string, string[][]>): Promise<void>;
}
export interface Line {
  push(groupId: string, text: string, retryKey: string): Promise<void>;
}
export interface Queue {
  enqueue(jobId: string): Promise<void>;
}
export interface Ports {
  ai: AI;
  google: Google;
  line: Line;
  queue?: Queue;
}
