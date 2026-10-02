import { describe, expect, it } from 'vitest';
import { parseDateTime } from './time';

describe('parseDateTime', () => {
  it.each([
    ['2026-09-30 10:50:07.088562', '2026-09-30T10:50:07.088Z'], // PostgreSQL, Oracle, H2
    ['2026-09-30 06:04:37.0', '2026-09-30T06:04:37.000Z'], // MySQL
    ['2026-09-30 06:13:46.7266667', '2026-09-30T06:13:46.726Z'], // MSSQL
    ['2026-09-30 06:13:46', '2026-09-30T06:13:46.000Z'],
    ['2026-09-30T06:13:46', '2026-09-30T06:13:46.000Z'],
  ])('reads the zone-less database timestamp %s as UTC', (value, iso) => {
    expect(parseDateTime(value)?.toISOString()).toBe(iso);
  });

  it('keeps an explicit offset', () => {
    expect(parseDateTime('2026-09-30T05:40:13Z')?.toISOString()).toBe('2026-09-30T05:40:13.000Z');
    expect(parseDateTime('2026-09-30T11:10:13+05:30')?.toISOString()).toBe('2026-09-30T05:40:13.000Z');
  });

  it('accepts epoch millis and Date', () => {
    expect(parseDateTime(0)?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    const d = new Date();
    expect(parseDateTime(d)).toBe(d);
  });

  it.each([undefined, null, '', 'not a date'])('returns null for %s', (value) => {
    expect(parseDateTime(value)).toBeNull();
  });
});
