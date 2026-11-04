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

function gasFunctions(): any {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const context: Record<string, unknown> = {
    Utilities: { formatDate: (date: Date) => date.toISOString().slice(0, 10) },
  };
  runInNewContext(
    source +
      '\nglobalThis.__mentionCommand = mentionCommand_;' +
      ' globalThis.__parseAiRequest = parseAiRequest_;' +
      ' globalThis.__failureTransition = failureTransition_;' +
      ' globalThis.__retryCountersAfterFailure = retryCountersAfterFailure_;' +
      ' globalThis.__hasPersistedAiResult = hasPersistedAiResult_;' +
      ' globalThis.__managementSnapshotFromRows = managementSnapshotFromRows_;' +
      ' globalThis.__validateSummaryInput = validateSummaryInput_;' +
      ' globalThis.__validateExtraction = validateExtraction_;' +
      ' globalThis.__isDailyAiLimitReached = isDailyAiLimitReached_;' +
      ' globalThis.__isSummarySourceRow = isSummarySourceRow_;' +
      ' globalThis.__isWeeklySourceRow = isWeeklySourceRow_;' +
      ' globalThis.__approvedStatusForKind = approvedStatusForKind_;' +
      ' globalThis.__validateExecutiveResult = validateExecutiveResult_;',
    context,
  );
  return context;
}

function runPersistedSummaryJob(): {
  generated: number;
  fileCreated: number;
  sourceReads: number;
  validations: number;
  statuses: string[];
} {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const statuses: string[] = [];
  const requestValues = [
    'REQ-1',
    'ORGANIZE',
    'AI_DONE',
    '整理して',
    '2026-11-04T12:00:00.000Z',
    '2026-11-04T00:00:00.000Z',
    '2026-11-04T12:00:00.000Z',
    1,
    '# 保存済み',
    '保存済みの提案です。',
    '',
    'retry-key',
    0,
    '',
    '',
  ];
  const range = {
    setValue: (value: unknown) => {
      if (typeof value === 'string') statuses.push(value);
    },
    setValues: () => undefined,
  };
  const context: Record<string, any> = {
    __statuses: statuses,
    __requestValues: requestValues,
    __sheet: { getRange: () => range },
    __generated: 0,
    __fileCreated: 0,
    __sourceReads: 0,
    __validations: 0,
  };
  runInNewContext(
    source +
      '\nwithLock_ = (callback) => callback();' +
      ' sheet_ = () => globalThis.__sheet;' +
      ' dataRows_ = () => [{ number: 2, values: globalThis.__requestValues }];' +
      " summarySourceMessages_ = () => { globalThis.__sourceReads += 1; return [{ id: 'M-1', sentAt: '2026-11-04T01:00:00.000Z', body: '本文' }]; };" +
      ' managementSnapshot_ = () => ({ approvedItems: [], pendingCandidates: [] });' +
      ' validateSummaryInput_ = () => { globalThis.__validations += 1; };' +
      " generateExecutiveReport_ = () => { globalThis.__generated += 1; throw new Error('MUST_NOT_RUN'); };" +
      " createDailyExecutiveMarkdown_ = () => { globalThis.__fileCreated += 1; return 'https://drive.test/report'; };" +
      ' processPendingSummaryRequests_({});',
    context,
  );
  return {
    generated: context.__generated,
    fileCreated: context.__fileCreated,
    sourceReads: context.__sourceReads,
    validations: context.__validations,
    statuses,
  };
}

function runWeeklyFailureNotification(): { texts: string[]; statuses: string[] } {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const texts: string[] = [];
  const statuses: string[] = [];
  const reportValues = [
    'weekly:2026-11-01',
    'FAILED_TO_NOTIFY',
    '',
    '',
    '',
    '',
    'retry-key',
    'ANTHROPIC_HTTP_401',
    '',
    '',
    1,
    '',
  ];
  const context: Record<string, any> = {
    __texts: texts,
    __statuses: statuses,
    __reportValues: reportValues,
    __sheet: {
      getRange: () => ({
        setValue: (value: unknown) => {
          if (typeof value === 'string') statuses.push(value);
        },
        setValues: () => undefined,
      }),
    },
  };
  runInNewContext(
    source +
      '\nwithLock_ = (callback) => callback();' +
      ' sheet_ = () => globalThis.__sheet;' +
      ' dataRows_ = () => [{ number: 2, values: globalThis.__reportValues }];' +
      ' pushLineMessages_ = (values) => globalThis.__texts.push(...values);' +
      ' retryPendingWeeklyNotifications_({});',
    context,
  );
  return { texts, statuses };
}

function runStaleWeeklyRecovery(): string[] {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const recovered: string[] = [];
  const context: Record<string, any> = {
    __recovered: recovered,
    __reportValues: [
      'weekly:2026-11-01',
      'PROCESSING',
      '',
      '',
      '',
      '',
      'retry-key',
      '',
      '# 保存済み',
      '保存済みの提案です。',
      0,
      '',
      'M-1',
    ],
    __sheet: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  };
  runInNewContext(
    source +
      '\nwithLock_ = (callback) => callback();' +
      ' sheet_ = () => globalThis.__sheet;' +
      ' dataRows_ = () => [{ number: 2, values: globalThis.__reportValues }];' +
      ' retryPendingWeeklyNotifications_ = () => undefined;' +
      ' createWeeklyReportForWindow_ = (window) => globalThis.__recovered.push(window.key);' +
      " recoverWeeklyReports_({ groupId: 'G-1' });",
    context,
  );
  return recovered;
}

function runMissingWeeklyRecovery(
  automationStartedAt = '2026-10-01T00:00:00.000Z',
  groupId = 'G-1',
): string[] {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const recovered: string[] = [];
  const context: Record<string, any> = {
    __recovered: recovered,
    __sheet: {},
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) =>
          key === 'WEEKLY_AUTOMATION_STARTED_AT' ? automationStartedAt : '',
      }),
    },
  };
  runInNewContext(
    source +
      '\nwithLock_ = (callback) => callback();' +
      ' sheet_ = () => globalThis.__sheet;' +
      ' dataRows_ = () => [];' +
      ' retryPendingWeeklyNotifications_ = () => undefined;' +
      " weeklyWindow_ = () => ({ key: 'weekly:2026-11-01', start: new Date('2026-10-25T11:00:00.000Z'), end: new Date('2026-11-01T11:00:00.000Z') });" +
      ' createWeeklyReportForWindow_ = (window) => globalThis.__recovered.push(window.key);' +
      ` recoverWeeklyReports_({ groupId: ${JSON.stringify(groupId)} });`,
    context,
  );
  return recovered;
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

  it('accepts a command on the line after a leading bot mention only', () => {
    const functions = gasFunctions();
    const event = {
      type: 'message',
      message: {
        type: 'text',
        text: '@bot\n使い方',
        mention: { mentionees: [{ index: 0, length: 4, userId: 'Ubot' }] },
      },
    };
    expect(functions.__mentionCommand(event, { botUserId: 'Ubot' })).toBe('使い方');
    event.message.mention.mentionees[0]!.index = 1;
    expect(functions.__mentionCommand(event, { botUserId: 'Ubot' })).toBe('');
  });

  it('classifies 12-hour, N-day, and free-form executive requests', () => {
    const functions = gasFunctions();
    const config = { onDemandSummaryMaxDays: 31 };
    expect(functions.__parseAiRequest('整理して', config)).toEqual({
      type: 'ORGANIZE',
      hours: 12,
      prompt: '整理して',
    });
    expect(functions.__parseAiRequest('3日分整理して', config).hours).toBe(72);
    expect(functions.__parseAiRequest('直近3日分まとめて', config).hours).toBe(72);
    expect(functions.__parseAiRequest('今の進め方を考えて', config).type).toBe('EXECUTIVE_CHAT');
    expect(functions.__parseAiRequest('32日分整理して', config).error).toContain('1〜31日');
  });

  it('reuses a complete persisted AI result after a later-stage retry', () => {
    const functions = gasFunctions();
    expect(functions.__hasPersistedAiResult('# report', 'chat reply')).toBe(true);
    expect(functions.__hasPersistedAiResult('# report', '')).toBe(false);
  });

  it('uses finite retries and stops immediately for permanent AI/input errors', () => {
    const functions = gasFunctions();
    const first = functions.__failureTransition('LINE_REQUEST_FAILED', 0, 0);
    expect(first).toEqual({
      status: 'REQUESTED',
      attempts: 1,
      retryAt: '1970-01-01T00:05:00.000Z',
    });
    expect(functions.__failureTransition('LINE_REQUEST_FAILED', 2, 0).status).toBe('FAILED');
    expect(functions.__failureTransition('ANTHROPIC_HTTP_401', 0, 0).status).toBe('FAILED');
    expect(functions.__failureTransition('INPUT_LIMIT_CHARACTERS', 0, 0).status).toBe('FAILED');
    expect(
      functions.__retryCountersAfterFailure(
        functions.__failureTransition('ANTHROPIC_HTTP_401', 2, 0),
      ),
    ).toEqual({ attempts: 0, retryAt: '' });
  });

  it('passes active project state to reports without person records', () => {
    const functions = gasFunctions();
    const snapshot = functions.__managementSnapshotFromRows([
      ['I-1', 'DECISION', '採用案', '詳細', 'CONFIRMED', 'M-1'],
      ['I-2', 'PLAN', '次の進め方', '詳細', 'ACTIVE', 'M-2'],
      ['I-3', 'ISSUE', '残課題', '詳細', 'OPEN', 'M-3'],
      ['I-4', 'TASK', '却下済み', '詳細', 'REJECTED', 'M-4'],
    ]);
    expect(snapshot.approvedItems).toHaveLength(3);
    expect(snapshot.approvedItems[1]).toMatchObject({ kind: 'PLAN', status: 'ACTIVE' });
    expect(snapshot.pendingCandidates).toHaveLength(0);
    expect(Object.keys(snapshot.approvedItems[0])).not.toContain('userId');
  });

  it('enforces the 60,000-character limit across messages and managed state', () => {
    const functions = gasFunctions();
    const config = { onDemandSummaryMaxCharacters: 60_000 };
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-02T00:00:00.000Z');
    expect(() =>
      functions.__validateSummaryInput(
        [{ body: 'a'.repeat(59_000) }],
        [],
        '整理して',
        start,
        end,
        config,
      ),
    ).not.toThrow();
    expect(() =>
      functions.__validateSummaryInput(
        [{ body: 'a'.repeat(59_000) }],
        [{ detail: 'b'.repeat(2_000) }],
        '整理して',
        start,
        end,
        config,
      ),
    ).toThrow('INPUT_LIMIT_CHARACTERS');
  });

  it('accepts a future-direction PLAN only with exact message evidence', () => {
    const functions = gasFunctions();
    const extraction = {
      items: [
        {
          kind: 'PLAN',
          title: '次は検証を進める',
          detail: '検証を優先する',
          confidence: 0.9,
          evidence: [{ messageId: 'M-1', quote: '検証を進める' }],
        },
      ],
    };
    expect(() =>
      functions.__validateExtraction(extraction, [{ id: 'M-1', body: '次は検証を進める' }]),
    ).not.toThrow();
    extraction.items[0]!.evidence[0]!.quote = '存在しない引用';
    expect(() =>
      functions.__validateExtraction(extraction, [{ id: 'M-1', body: '次は検証を進める' }]),
    ).toThrow('INVALID_EVIDENCE');
  });

  it('stops the group-wide 21st AI request on the same day', () => {
    const functions = gasFunctions();
    const rows = Array.from({ length: 20 }, () => ({
      values: ['', '', '', '', '2026-11-04T03:00:00.000Z'],
    }));
    expect(functions.__isDailyAiLimitReached(rows.slice(0, 19), new Date('2026-11-04'), 20)).toBe(
      false,
    );
    expect(functions.__isDailyAiLimitReached(rows, new Date('2026-11-04'), 20)).toBe(true);
  });

  it('excludes imported historical rows from normal period organization', () => {
    const functions = gasFunctions();
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-05T00:00:00.000Z');
    const current = ['M-1', '', '', '2026-11-04T00:00:00.000Z', '本文', '', '', '', ''];
    const historical = current.slice();
    historical[8] = 'HISTORICAL';
    expect(functions.__isSummarySourceRow(current, start, end)).toBe(true);
    expect(functions.__isSummarySourceRow(historical, start, end)).toBe(false);
  });

  it('maps approved future direction to ACTIVE without auto-confirming it', () => {
    const functions = gasFunctions();
    expect(functions.__approvedStatusForKind('DECISION')).toBe('CONFIRMED');
    expect(functions.__approvedStatusForKind('PLAN')).toBe('ACTIVE');
    expect(functions.__approvedStatusForKind('TASK')).toBe('OPEN');
  });

  it('keeps pending candidates separate from approved management state', () => {
    const functions = gasFunctions();
    const snapshot = functions.__managementSnapshotFromRows([
      ['I-1', 'DECISION', '承認済み', '詳細', 'CONFIRMED', 'M-1'],
      ['I-2', 'DECISION', '確認待ち', '詳細', 'PENDING', 'M-2'],
    ]);
    expect(snapshot.approvedItems.map((item: any) => item.id)).toEqual(['I-1']);
    expect(snapshot.pendingCandidates.map((item: any) => item.id)).toEqual(['I-2']);
  });

  it('requires executive output to label pending items and advice as proposals', () => {
    const functions = gasFunctions();
    const valid = {
      markdown: [
        '## 整理',
        '本文',
        '## 決定事項',
        'なし',
        '## 今後の進行方針',
        'なし',
        '## 残課題',
        'なし',
        '## 確認待ち候補（未確定）',
        'なし',
        '## 統括ならどうするか（提案）',
        '提案内容',
      ].join('\n'),
      chatReply: '統括からの提案です。',
    };
    expect(() => functions.__validateExecutiveResult(valid)).not.toThrow();
    expect(() =>
      functions.__validateExecutiveResult({
        ...valid,
        markdown: valid.markdown.replace('（未確定）', ''),
      }),
    ).toThrow('INVALID_AI_OUTPUT');
    expect(() =>
      functions.__validateExecutiveResult({ ...valid, chatReply: '提案' + 'a'.repeat(2500) }),
    ).toThrow('INVALID_AI_OUTPUT');
    expect(() =>
      functions.__validateExecutiveResult({
        ...valid,
        markdown: valid.markdown.replace('## 整理', '引用: ## 整理'),
      }),
    ).toThrow('INVALID_AI_OUTPUT');
  });

  it('includes a cutoff-time NEW message in the weekly source', () => {
    const functions = gasFunctions();
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-08T00:00:00.000Z');
    const values = ['M-1', '', '', '2026-11-07T23:59:00.000Z', '本文', 'NEW', '', '', ''];
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(functions.__isWeeklySourceRow(values, end)).toBe(true);
    values[3] = '2026-10-31T23:59:00.000Z';
    expect(functions.__isWeeklySourceRow(values, end)).toBe(true);
    values[8] = 'HISTORICAL';
    expect(functions.__isWeeklySourceRow(values, end)).toBe(false);
  });

  it('reuses persisted AI output through the summary job path', () => {
    const result = runPersistedSummaryJob();
    expect(result.generated).toBe(0);
    expect(result.fileCreated).toBe(1);
    expect(result.sourceReads).toBe(0);
    expect(result.validations).toBe(0);
    expect(result.statuses).toContain('READY_TO_SEND');
  });

  it('turns a terminal weekly generation failure into a safe LINE notice', () => {
    const result = runWeeklyFailureNotification();
    expect(result.texts.join('\n')).toContain('週次レポートの生成に失敗');
    expect(result.texts.join('\n')).not.toContain('ANTHROPIC_HTTP_401');
    expect(result.statuses).toContain('FAILED_FINAL');
  });

  it('automatically recovers a weekly job left stale in PROCESSING', () => {
    expect(runStaleWeeklyRecovery()).toEqual(['weekly:2026-11-01']);
  });

  it('creates the latest weekly report when its scheduler trigger was missed', () => {
    expect(runMissingWeeklyRecovery()).toEqual(['weekly:2026-11-01']);
    expect(runMissingWeeklyRecovery('2026-11-02T00:00:00.000Z')).toEqual([]);
    expect(runMissingWeeklyRecovery('2026-10-01T00:00:00.000Z', '')).toEqual([]);
  });
});
