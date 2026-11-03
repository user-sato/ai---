import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  signatureValid,
  validateExtraction,
  extractionSchema,
  fingerprint,
  weeklyPeriod,
  monthlyPeriod,
  safeError,
  retryDelay,
} from '../src/domain.js';
import { loadConfig } from '../src/config.js';
import { internalAuth } from '../src/app.js';
describe('security and extraction', () => {
  it('verifies original raw bytes and rejects tampering/malformed signatures', () => {
    const body = Buffer.from('{ "events": [] }');
    const signature = createHmac('sha256', 'test').update(body).digest('base64');
    expect(signatureValid(body, signature, 'test')).toBe(true);
    expect(signatureValid(Buffer.from('{"events":[]}'), signature, 'test')).toBe(false);
    for (const bad of ['', signature + '=', '???', 'a'.repeat(44)])
      expect(signatureValid(body, bad, 'test')).toBe(false);
    expect(signatureValid(body, signature, '')).toBe(false);
  });
  it('rejects fabricated sources, quotes, statuses, confidence, and inferred assignees', () => {
    const base = {
      kind: 'DECISION',
      title: '参加費',
      detail: '1500円にしようかな',
      confidence: 0.8,
      evidence: [{ messageId: 'm1', quote: '1500円' }],
    };
    const sources = [
      { id: 'm1', body: '参加費1500円にしようかな', sentAt: new Date(), userId: null },
    ];
    expect(validateExtraction({ items: [base] }, sources).items).toHaveLength(1);
    for (const item of [
      { ...base, status: 'CONFIRMED' },
      { ...base, assigneeUserId: 'guess' },
      { ...base, confidence: 2 },
      { ...base, evidence: [] },
      { ...base, evidence: [{ messageId: 'other', quote: '1500円' }] },
      { ...base, evidence: [{ messageId: 'm1', quote: '確定しました' }] },
    ])
      expect(() => validateExtraction({ items: [item] }, sources)).toThrow();
  });
  it('rejects freeform malformed output', () =>
    expect(extractionSchema.safeParse('hello').success).toBe(false));
  it('normalizes task titles for duplicate suppression', () =>
    expect(fingerprint(' チラシ、作成！ ')).toBe(fingerprint('チラシ作成')));
  it('redacts arbitrary secret-bearing SDK errors', () => {
    expect(safeError(new Error('Bearer API_KEY user body'))).toBe('JOB_FAILED');
    expect(safeError({ status: 429, message: 'secret' })).toBe('EXTERNAL_429');
    expect(safeError({ code: 'password-value' })).toBe('JOB_FAILED');
  });
  it('uses capped exponential retry', () => {
    expect(retryDelay(0)).toBe(30000);
    expect(retryDelay(100)).toBe(3600000);
  });
  it('defaults to dry-run and requires explicit consent for live mode', () => {
    const env = {
      DATABASE_URL: 'postgresql://localhost/test',
      INTERNAL_AUTH_MODE: 'local',
      INTERNAL_LOCAL_TOKEN: 'x'.repeat(32),
    };
    expect(loadConfig(env).DRY_RUN).toBe(true);
    expect(() => loadConfig({ ...env, DRY_RUN: 'false' })).toThrow();
    expect(() => loadConfig({ ...env, DRY_RUN: 'oops' })).toThrow();
  });
  it('authenticates local endpoints without accepting empty or wrong tokens', async () => {
    const c = loadConfig({
      DATABASE_URL: 'postgresql://localhost/test',
      INTERNAL_AUTH_MODE: 'local',
      INTERNAL_LOCAL_TOKEN: 'x'.repeat(32),
    });
    expect(await internalAuth(c).verify('x'.repeat(32))).toBe(true);
    expect(await internalAuth(c).verify('')).toBe(false);
    expect(await internalAuth(c).verify('y'.repeat(32))).toBe(false);
  });
});
describe('JST report boundaries', () => {
  it('starts initial weekly period at Monday JST', () => {
    const p = weeklyPeriod(new Date('2026-11-08T11:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-11-01T15:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-11-08T11:00:00.000Z');
  });
  it('continues from the prior Sunday cutoff without missing late messages', () => {
    const p = weeklyPeriod(new Date('2026-11-15T11:00:00Z'), new Date('2026-11-08T11:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-11-08T11:00:00.000Z');
  });
  it('puts the Nov30-Dec6 report into November', () =>
    expect(weeklyPeriod(new Date('2026-12-06T11:00:00Z')).folderMonth).toBe('2026-11'));
  it('retry on Monday retains the last Sunday cutoff', () =>
    expect(weeklyPeriod(new Date('2026-11-08T16:00:00Z')).end.toISOString()).toBe(
      '2026-11-08T11:00:00.000Z',
    ));
  it('uses calendar months in JST including January rollover', () => {
    const p = monthlyPeriod(new Date('2027-01-01T00:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-11-30T15:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });
});
