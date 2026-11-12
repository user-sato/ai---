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
      ' globalThis.__selectSummarySourceRows = selectSummarySourceRows_;' +
      ' globalThis.__executiveInput = executiveInput_;' +
      ' globalThis.__messageFromRow = messageFromRow_;' +
      ' globalThis.__summaryScopeLine = summaryScopeLine_;' +
      ' globalThis.__replaceNames = replaceNames_;' +
      ' globalThis.__parseSpeakerAliases = parseSpeakerAliases_;' +
      ' globalThis.__speakerAliases = speakerAliases_;' +
      ' globalThis.__executiveInstruction = executiveInstruction_;' +
      ' globalThis.__isWeeklySourceRow = isWeeklySourceRow_;' +
      ' globalThis.__approvedStatusForKind = approvedStatusForKind_;' +
      ' globalThis.__validateExecutiveResult = validateExecutiveResult_;' +
      ' globalThis.__anthropicStructuredRequest = anthropicStructuredRequest_;' +
      ' globalThis.__parseAnthropicJson = parseAnthropicJson_;',
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
    for (const text of [
      '7日分の整理',
      '直近7日分を整理して',
      '7日分整理してください',
      '７日分整理して',
      '1週間分まとめて',
    ]) {
      const parsed = functions.__parseAiRequest(text, config);
      expect(parsed.type).toBe('ORGANIZE');
      expect(parsed.hours).toBe(168);
    }
    expect(functions.__parseAiRequest('3日間の流れで次に何をすべき？', config)).toEqual({
      type: 'EXECUTIVE_CHAT',
      hours: 72,
      prompt: '3日間の流れで次に何をすべき？',
    });
    expect(functions.__parseAiRequest('5週間分整理して', config).error).toContain('1〜31日');
    expect(functions.__parseAiRequest('11月4日の件を整理して', config).hours).toBe(12);
    expect(functions.__parseAiRequest('直近7日を整理', config).hours).toBe(168);
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

  it('includes imported historical rows in period organization without overlap', () => {
    const functions = gasFunctions();
    const start = new Date('2026-10-01T00:00:00.000Z');
    const end = new Date('2026-11-05T00:00:00.000Z');
    const row = (id: string, sentAt: string, key = '') => ({
      values: [id, '', '', sentAt, '本文', '', '', '', key],
    });
    const rows = [
      row('M-1', '2026-11-04T00:00:00.000Z'),
      row('HIST-old', '2026-10-20T00:00:00.000Z', 'HISTORICAL'),
      row('HIST-overlap', '2026-11-04T01:00:00.000Z', 'HISTORICAL'),
      row('HIST-outside', '2026-09-01T00:00:00.000Z', 'HISTORICAL'),
    ];
    expect(
      functions.__selectSummarySourceRows(rows, start, end).map((r: any) => r.values[0]),
    ).toEqual(['HIST-old', 'M-1']);
    expect(
      functions.__selectSummarySourceRows(rows.slice(1), start, end).map((r: any) => r.values[0]),
    ).toEqual(['HIST-old', 'HIST-overlap']);
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

  it('requires the policy-summary document structure and a short chat reply', () => {
    const functions = gasFunctions();
    const valid = {
      markdown: [
        '# イベント企画・運営方針まとめ',
        '- 対象期間：2026-10-29〜2026-11-05',
        '## 1. 全体方針',
        '本文',
        '## 2. 論点ごとの状況',
        '### 2.1 昔遊び体験会',
        '## 3. 決定・合意の状況',
        '承認済みの決定事項：なし',
        '会話上の合意（未承認）：文体をです・ます調へ',
        '## 4. 直近のタスク',
        '| 優先 | タスク | 状況 |',
        '|---|---|---|',
        '| 高 | チラシ修正 | 調整中 |',
        '## 5. 今後の進め方（提案）',
        '1. 告知内容を固める',
        '## 6. 認識のズレ',
        '特になし',
        '## 7. 結論',
        'チラシ完成が最優先',
      ].join('\n'),
      chatReply: '最優先: チラシ完成\n要点: …\n詳細は資料を参照',
    };
    expect(functions.__validateExecutiveResult(valid)).toBe(valid.markdown);
    const broken = (from: string, to: string) => ({
      ...valid,
      markdown: valid.markdown.replace(from, to),
    });
    for (const [from, to] of [
      ['# イベント', 'イベント'],
      ['## 6. 認識のズレ', '引用: ## 6. 認識のズレ'],
      ['| 優先 | タスク | 状況 |', '| タスク |'],
      ['会話上の合意（未承認）', '会話上の合意'],
      ['## 7. 結論', '## 7. まとめ'],
    ]) {
      expect(() => functions.__validateExecutiveResult(broken(from, to))).toThrow(
        'INVALID_AI_STRUCTURE',
      );
    }
    expect(() =>
      functions.__validateExecutiveResult({ ...valid, chatReply: 'a'.repeat(701) }),
    ).toThrow('INVALID_AI_STRUCTURE');
    expect(() => functions.__validateExecutiveResult({ ...valid, markdown: '' })).toThrow(
      'INVALID_AI_OUTPUT',
    );
    expect(functions.__failureTransition('INVALID_AI_STRUCTURE', 0, 0).status).toBe('REQUESTED');
  });

  it('accepts heading and table variations and normalizes the section headings', () => {
    const functions = gasFunctions();
    const markdown = [
      '# まとめ',
      '## 1．全体方針',
      '## 2.論点ごとの状況',
      '### 2.1 昔遊び',
      '### 3. 決定・合意の状況',
      '決定事項（承認済）：なし',
      '### 未承認の合意',
      '**## 4. 直近のタスク**',
      '優先度 | タスク | 状況 | 根拠',
      '## ５. 今後の進め方(推奨)',
      '## 6. 重要な認識のズレ',
      '## 7. 結論',
    ].join('\n');
    const result = functions.__validateExecutiveResult({ markdown, chatReply: '要約' }).split('\n');
    expect(result).toContain('## 1. 全体方針');
    expect(result).toContain('## 2. 論点ごとの状況');
    expect(result).toContain('### 2.1 昔遊び');
    expect(result).toContain('## 3. 決定・合意の状況');
    expect(result).toContain('## 4. 直近のタスク');
    expect(result).toContain('## 5. 今後の進め方（提案）');
    expect(result).toContain('## 6. 認識のズレ');
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

  it('requests Anthropic JSON via structured outputs without forced tool_choice', () => {
    const gas = gasFunctions();
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: { type: 'array', maxItems: 30, minItems: 1, items: { type: 'string' } },
      },
      required: ['items'],
    };
    const request = gas.__anthropicStructuredRequest(
      { aiModel: 'claude-sonnet-5-5' },
      'system',
      'input',
      schema,
      16000,
    );
    expect(request.tool_choice).toBeUndefined();
    expect(request.tools).toBeUndefined();
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.output_config.format.schema.properties.items.maxItems).toBeUndefined();
    expect(request.output_config.format.schema.properties.items.minItems).toBe(1);
    expect(schema.properties.items.maxItems).toBe(30);
  });

  it('parses Anthropic structured text and rejects refusal or truncation', () => {
    const gas = gasFunctions();
    expect(
      gas.__parseAnthropicJson({
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '{"markdown":"m","chatReply":"c"}' },
        ],
      }),
    ).toEqual({ markdown: 'm', chatReply: 'c' });
    expect(() => gas.__parseAnthropicJson({ stop_reason: 'refusal', content: [] })).toThrow(
      'ANTHROPIC_REFUSAL',
    );
    expect(() =>
      gas.__parseAnthropicJson({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '{' }],
      }),
    ).toThrow('INVALID_AI_OUTPUT');
    expect(gas.__failureTransition('ANTHROPIC_REFUSAL', 0, 0).status).toBe('FAILED');
  });

  it('sends JST times, real speaker names and project context without raw user IDs', () => {
    const gas = gasFunctions();
    const messages = [
      { id: 'M-1', sentAt: '2026-11-04T15:30:00.000Z', body: 'A案にしたい', sender: 'Uabc123' },
      { id: 'HIST-1', sentAt: '2026-10-01T00:00:00.000Z', body: '賛成', sender: 'historical:山田' },
      { id: 'M-2', sentAt: '2026-11-04T16:00:00.000Z', body: '再確認', sender: 'Uabc123' },
      { id: 'M-3', sentAt: 'invalid', body: '不明', sender: '' },
      {
        id: 'HIST-2',
        sentAt: '2026-10-02T00:00:00.000Z',
        body: '佐藤さんに確認',
        sender: 'historical:佐藤 太郎',
      },
      { id: 'M-4', sentAt: '2026-11-04T17:00:00.000Z', body: '了解', sender: 'Uk0nd0' },
    ];
    const json = gas.__executiveInput(
      messages,
      '佐藤さんの案を整理して',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-05T00:00:00.000Z'),
      { approvedItems: [], pendingCandidates: [] },
      {
        projectContext: '文化祭の出し物準備',
        speakerAliases: 'Uk0nd0=近藤,佐藤 太郎=佐藤',
      },
    );
    const input = JSON.parse(json);
    expect(json).not.toContain('Uabc123');
    expect(json).not.toContain('Uk0nd0');
    expect(input.projectContext).toBe('文化祭の出し物準備');
    expect(input.period.start).toBe('2026-11-01 09:00 JST');
    expect(input.messages.map((m: any) => m.speaker)).toEqual([
      '未登録の参加者A',
      '山田',
      '未登録の参加者A',
      '不明',
      '佐藤',
      '近藤',
    ]);
    expect(input.messages[4].text).toBe('佐藤さんに確認');
    expect(input.userPrompt).toBe('佐藤さんの案を整理して');
    expect(input.messages[0].sentAt).toBe('2026-11-05 00:30 JST');
    expect(input.messages[3].sentAt).toBe('');
  });

  it('keeps the executive instruction aligned with the required headings', () => {
    const gas = gasFunctions();
    const instruction = gas.__executiveInstruction() as string;
    const headings = [
      '## 1. 全体方針',
      '## 2. 論点ごとの状況',
      '## 3. 決定・合意の状況',
      '## 4. 直近のタスク',
      '## 5. 今後の進め方（提案）',
      '## 6. 認識のズレ',
      '## 7. 結論',
    ];
    let previous = -1;
    headings.forEach((heading) => {
      const index = instruction.indexOf('\n' + heading);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    });
    expect(instruction).toContain('700文字以内');
    expect(instruction).toContain('資料の全文や表は貼らない');
    expect(instruction).toContain('担当者・期限・金額を推測しない');
  });

  it('replaces configured names in one pass and only in string values', () => {
    const gas = gasFunctions();
    const aliases = gas.__parseSpeakerAliases('佐藤=s藤,藤=f,M=x');
    expect(gas.__replaceNames('佐藤と藤', aliases)).toBe('s藤とf');
    const json = gas.__executiveInput(
      [{ id: 'M-1', sentAt: '2026-11-04T00:00:00.000Z', body: 'M案', sender: '' }],
      'M',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-05T00:00:00.000Z'),
      { approvedItems: [{ id: 'I-M1', title: '佐藤の案', status: 'CONFIRMED' }] },
      { speakerAliases: '佐藤=s藤,藤=f,M=x' },
    );
    const input = JSON.parse(json);
    expect(input.messages[0].messageId).toBe('M-1');
    expect(input.messages[0].text).toBe('x案');
    expect(input.userPrompt).toBe('x');
    expect(input.managementItems.approvedItems[0]).toEqual({
      id: 'I-M1',
      title: 's藤の案',
      status: 'CONFIRMED',
    });
  });

  it('does not merge different people on ambiguous partial matches', () => {
    const gas = gasFunctions();
    const aliases = gas.__parseSpeakerAliases('佐藤=s藤,近藤=k藤,佐藤 近藤=sk');
    const speakers = gas.__speakerAliases(
      [
        { sender: 'historical:佐藤 近藤' },
        { sender: 'historical:佐藤 花子' },
        { sender: 'historical:佐藤近藤' },
      ],
      aliases,
    );
    expect(speakers.get('historical:佐藤 近藤')).toBe('sk');
    expect(speakers.get('historical:佐藤 花子')).toBe('s藤');
    expect(speakers.get('historical:佐藤近藤')).toBe('佐藤近藤');
  });

  it('maps weekly and period rows with the sender column', () => {
    const gas = gasFunctions();
    expect(gas.__messageFromRow({ values: ['M-1', '', 'Uabc', '2026-11-04', '本文'] })).toEqual({
      id: 'M-1',
      sentAt: '2026-11-04',
      body: '本文',
      sender: 'Uabc',
    });
  });

  it('shows the actual period and message counts in the LINE reply', () => {
    const gas = gasFunctions();
    expect(
      gas.__summaryScopeLine(
        new Date('2026-10-29T03:00:00.000Z'),
        new Date('2026-11-05T03:00:00.000Z'),
        [{ id: 'HIST-1' }, { id: 'M-1' }, { id: 'HIST-2' }],
      ),
    ).toBe('対象: 2026-10-29 12:00 JST〜2026-11-05 12:00 JST／発言3件（うち導入前の履歴2件）');
  });

  it('keeps only sozosha-style tag lines', () => {
    const gas = sozoshaHarness().context;
    const members = ['近藤', '内藤', '佐藤'];
    const valid = gas.__isValidSozoshaLine;
    expect(valid('- 届出を調べる（根拠: M-1） #未決 #ToDo #近藤', members)).toBe(true);
    expect(valid('- 2027-01-09 さのやカフェ #未決 #予定', members)).toBe(true);
    expect(valid('- 届出を調べる #ToDo #近藤', members)).toBe(false);
    expect(valid('- 日付のない予定 #未決 #予定', members)).toBe(false);
    expect(valid('- 決まった #未決 #決定', members)).toBe(false);
    expect(valid('- 担当違い #未決 #ToDo #山田', members)).toBe(false);
    expect(valid('届出を調べる #未決', members)).toBe(false);
    expect(gas.__nextSozoshaIssueStatus('')).toBe('RETRY:1');
    expect(gas.__nextSozoshaIssueStatus('RETRY:2')).toBe('FAILED');
  });

  it('creates one weekly sozosha issue only after the weekly report is sent', () => {
    const h = sozoshaHarness();
    h.run({ token: '' });
    expect(h.fetches).toHaveLength(0);
    h.run();
    expect(h.fetches).toHaveLength(1);
    expect(h.fetches[0].url).toBe('https://api.github.com/repos/developerKondo/sozosha/issues');
    const issue = JSON.parse(h.fetches[0].options.payload);
    expect(issue.title).toContain('[書記Bot] 週次');
    expect(issue.body).toContain('- 届出を調べる #未決 #ToDo #近藤');
    expect(issue.body).not.toContain('#決定');
    expect(h.row.slice(13, 16)).toEqual(['https://github.com/x/1', 'CREATED', '']);
    h.run();
    expect(h.fetches).toHaveLength(1);
  });

  it('retries client errors but never recreates an issue with an unknown outcome', () => {
    const rejected = sozoshaHarness({ status: 422 });
    expect(() => rejected.run()).toThrow('GITHUB_HTTP_422');
    expect(rejected.row[14]).toBe('RETRY:1');
    const unknown = sozoshaHarness({ status: 502 });
    expect(() => unknown.run()).toThrow('GITHUB_OUTCOME_UNKNOWN');
    expect(unknown.row[14]).toBe('CREATING');
    const thrown = sozoshaHarness({ throwOnFetch: true });
    expect(() => thrown.run()).toThrow('GITHUB_OUTCOME_UNKNOWN');
    expect(thrown.row[14]).toBe('CREATING');
    thrown.run();
    expect(thrown.fetches).toHaveLength(1);
  });
});

function sozoshaHarness(options: { status?: number; throwOnFetch?: boolean } = {}) {
  const source = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const row: unknown[] = [
    'weekly:2026-11-15',
    'SENT',
    'https://drive.example/weekly',
    '',
    '',
    '',
    '',
    '',
    '# 週次まとめ',
    '',
    0,
    '',
    '',
    '',
    '',
    '',
  ];
  const fetches: { url: string; options: any }[] = [];
  const context: Record<string, any> = {
    Utilities: { formatDate: (date: Date) => date.toISOString().slice(0, 10) },
    console: { log: () => undefined },
    UrlFetchApp: {
      fetch: (url: string, fetchOptions: unknown) => {
        fetches.push({ url, options: fetchOptions });
        if (options.throwOnFetch) throw new Error('timeout');
        return {
          getResponseCode: () => options.status || 201,
          getContentText: () => JSON.stringify({ html_url: 'https://github.com/x/1' }),
        };
      },
    },
  };
  runInNewContext(
    source +
      `
withLock_ = (fn) => fn();
ensureSchema_ = () => undefined;
sheet_ = () => ({
  getRange: (r, c, rows, cols) => ({
    setValues: (values) => values[0].forEach((v, i) => { globalThis.__row[c - 1 + i] = v; }),
    setValue: (v) => { globalThis.__row[c - 1] = v; },
  }),
});
dataRows_ = () => [{ number: 2, values: globalThis.__row.slice() }];
callAiJson_ = () => ({ lines: ['- 届出を調べる #未決 #ToDo #近藤', '- 決まった #決定'] });
globalThis.__sync = syncWeeklySozoshaIssues_;
globalThis.__isValidSozoshaLine = isValidSozoshaLine_;
globalThis.__nextSozoshaIssueStatus = nextSozoshaIssueStatus_;
`,
    Object.assign(context, { __row: row }),
  );
  const run = (overrides: { token?: string } = {}) =>
    context.__sync({
      sozoshaGithubToken: overrides.token ?? 'token',
      sozoshaGithubRepo: 'developerKondo/sozosha',
      sozoshaMemberTags: ['近藤', '内藤', '佐藤'],
    });
  return { context, run, fetches, row };
}
