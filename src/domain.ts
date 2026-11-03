import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DateTime } from 'luxon';
import { z } from 'zod';
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export function signatureValid(body: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}
export const extractionSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            kind: z.enum(['DECISION', 'TASK', 'ISSUE', 'CHANGE']),
            title: z.string().min(1).max(200),
            detail: z.string().max(2000),
            confidence: z.number().min(0).max(1),
            evidence: z
              .array(
                z.object({ messageId: z.string(), quote: z.string().min(1).max(1000) }).strict(),
              )
              .min(1)
              .max(20),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export type Source = { id: string; body: string; sentAt: Date; userId: string | null };
export function validateExtraction(value: unknown, sources: Source[]): Extraction {
  const parsed = extractionSchema.parse(value);
  for (const item of parsed.items)
    for (const evidence of item.evidence) {
      const source = sources.find((s) => s.id === evidence.messageId);
      if (!source || !source.body.includes(evidence.quote))
        throw new Error('Invalid extraction evidence');
    }
  return parsed;
}
export const fingerprint = (title: string) =>
  hash(
    title
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]/gu, ''),
  );
export function weeklyPeriod(now: Date, previous?: Date) {
  const current = DateTime.fromJSDate(now, { zone: 'Asia/Tokyo' });
  const cutoff = current.startOf('week').plus({ days: 6, hours: 20 });
  // A Scheduler retry must retain the scheduled Sunday's cutoff.
  const end = current < cutoff ? cutoff.minus({ weeks: 1 }) : cutoff;
  const start = previous
    ? DateTime.fromJSDate(previous, { zone: 'Asia/Tokyo' })
    : end.startOf('week');
  return {
    start: start.toJSDate(),
    end: end.toJSDate(),
    folderMonth: end.startOf('week').toFormat('yyyy-MM'),
  };
}
export function monthlyPeriod(now: Date) {
  const end = DateTime.fromJSDate(now, { zone: 'Asia/Tokyo' }).startOf('month');
  return {
    start: end.minus({ months: 1 }).toJSDate(),
    end: end.toJSDate(),
    folderMonth: end.minus({ months: 1 }).toFormat('yyyy-MM'),
  };
}
export const formatDate = (d: Date) =>
  DateTime.fromJSDate(d, { zone: 'Asia/Tokyo' }).toFormat('yyyy-MM-dd HH:mm');
export function safeError(error: unknown): string {
  const code =
    (error as { status?: number; code?: unknown })?.status ?? (error as { code?: unknown })?.code;
  return typeof code === 'number' ? `EXTERNAL_${code}` : 'JOB_FAILED';
}
export const retryDelay = (attempt: number) =>
  Math.min(3600, 30 * 2 ** Math.min(attempt, 7)) * 1000;
