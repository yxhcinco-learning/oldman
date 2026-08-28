import { expect, it } from 'vitest';
import { formatTime } from '../lib/domain/writing';

const now = new Date(2026, 7, 27, 16, 10, 30);
it.each([
  [new Date(2026, 7, 27, 16, 10, 10), '刚刚'],
  [new Date(2026, 7, 27, 16, 9, 30), '今天 16:09'],
  [new Date(2026, 7, 27, 8, 1), '今天 08:01'],
  [new Date(2026, 7, 26, 13, 1), '昨天 13:01'],
  [new Date(2026, 6, 25, 10, 1), '7月25日 10:01'],
  [new Date(2025, 7, 27, 10, 1), '2025年8月27日 10:01'],
  [new Date(2026, 7, 28, 10, 1), '8月28日 10:01'],
])('formats real local dates using the approved presentation (%s)', (date, expected) => {
  expect(formatTime(date.toISOString(), now)).toBe(expected);
});
it('uses calendar yesterday across month/year boundaries and rejects invalid dates safely', () => {
  expect(formatTime(new Date(2025, 11, 31, 23, 40).toISOString(), new Date(2026, 0, 1, 0, 20))).toBe('昨天 23:40');
  expect(formatTime('invalid', now)).toBe('时间未知');
});
