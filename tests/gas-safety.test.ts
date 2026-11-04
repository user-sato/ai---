import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function plainTextConverter(): (value: unknown) => string {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const context: Record<string, unknown> = {};
  runInNewContext(source + '\nglobalThis.__asPlainText = asPlainText_;', context);
  return context.__asPlainText as (value: unknown) => string;
}

function syncedViewValues(items: unknown[][]): unknown[][] {
  const writes: unknown[][][] = [];
  const mockSheet = (name: string) => ({
    getName: () => name,
    clearContents: () => undefined,
    getRange: () => ({ setValues: (values: unknown[][]) => writes.push(values) }),
    setFrozenRows: () => undefined,
  });
  const context: Record<string, unknown> = {
    __mockSheet: mockSheet,
    __mockDataRows: (sheet: { getName(): string }) =>
      sheet.getName() === 'Items' ? items.map((values) => ({ values })) : [],
  };
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  runInNewContext(
    source +
      '\nsheet_ = globalThis.__mockSheet; dataRows_ = globalThis.__mockDataRows; globalThis.__syncViews = syncViews_;',
    context,
  );
  (context.__syncViews as () => void)();
  return writes.find((values) => values[1]?.[0] === 'I-formula')!;
}

describe('GAS sheet value safety', () => {
  it('escapes formula-leading user text before it is written to Sheets', () => {
    const asPlainText = plainTextConverter();
    ['=IMPORTDATA("https://example.test")', '+1+1', '-1+1', '@SUM(A1:A2)'].forEach((value) => {
      expect(asPlainText(value)).toBe("'" + value);
    });
    expect(asPlainText('通常の発言')).toBe('通常の発言');
  });

  it('escapes a formula again when synchronizing a view sheet', () => {
    const values = syncedViewValues([
      [
        'I-formula',
        'TASK',
        '=IMPORTDATA("https://example.test")',
        '+1+1',
        'PENDING',
        '',
        '',
        '',
        '',
      ],
    ]);
    expect(values[1]?.[2]).toBe('\'=IMPORTDATA("https://example.test")');
    expect(values[1]?.[3]).toBe("'+1+1");
  });
});
