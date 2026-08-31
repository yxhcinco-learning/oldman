// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SpeechTicketError, SpeechTicketStore } from '../server/speech-ticket-store';

const ticket = (number: number) => `speech_ticket_${number}`.padEnd(43, 'x');

describe('一次性小程序语音 ticket', () => {
  it('签发高熵等价 ticket，并在第一次消费时原子删除', () => {
    let number = 0;
    const store = new SpeechTicketStore({ now: () => 1000, randomTicket: () => ticket(++number) });
    const issued = store.issue('user-one');
    expect(issued).toEqual({ ticket: ticket(1), expiresAt: 61_000 });
    expect(store.consume(issued.ticket)).toMatchObject({ userId: 'user-one', issuedAt: 1000, expiresAt: 61_000 });
    expect(() => store.consume(issued.ticket)).toThrowError(expect.objectContaining<Partial<SpeechTicketError>>({ category: 'invalid_ticket' }));
    expect(store.size()).toBe(0);
  });

  it('拒绝缺失、错误用途和到期 ticket，错误用途也不能再次使用', () => {
    let now = 1000;
    let number = 0;
    const store = new SpeechTicketStore({ now: () => now, ttlMs: 100, randomTicket: () => ticket(++number) });
    expect(() => store.consume('short')).toThrowError(expect.objectContaining({ category: 'invalid_ticket' }));
    const wrongPurpose = store.issue('user-one');
    expect(() => store.consume(wrongPurpose.ticket, 'other' as 'speech')).toThrowError(expect.objectContaining({ category: 'invalid_ticket' }));
    expect(() => store.consume(wrongPurpose.ticket)).toThrowError(expect.objectContaining({ category: 'invalid_ticket' }));
    const expired = store.issue('user-one');
    now = expired.expiresAt;
    expect(() => store.consume(expired.ticket)).toThrowError(expect.objectContaining({ category: 'invalid_ticket' }));
  });

  it('限制全局与单用户未消费数量，并以有界清理释放空间', () => {
    let now = 1000;
    let number = 0;
    const store = new SpeechTicketStore({ now: () => now, ttlMs: 100, maxTickets: 2, maxTicketsPerUser: 1, randomTicket: () => ticket(++number) });
    store.issue('user-one');
    expect(() => store.issue('user-one')).toThrowError(expect.objectContaining({ category: 'ticket_limited' }));
    store.issue('user-two');
    expect(() => store.issue('user-three')).toThrowError(expect.objectContaining({ category: 'ticket_limited' }));
    now += 100;
    expect(store.cleanup()).toBe(2);
    expect(store.issue('user-three').ticket).toBe(ticket(3));
  });
});
