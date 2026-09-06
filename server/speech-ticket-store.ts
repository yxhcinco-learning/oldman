import { randomBytes } from 'node:crypto';
import { sha256 } from './mini-identity-store';

export type SpeechTicketPurpose = 'speech';
export type SpeechTicketErrorCategory = 'invalid_ticket' | 'ticket_limited';

export class SpeechTicketError extends Error {
  constructor(readonly category: SpeechTicketErrorCategory) {
    super(category);
    this.name = 'SpeechTicketError';
  }
}

interface TicketRecord {
  userId: string;
  purpose: SpeechTicketPurpose;
  issuedAt: number;
  expiresAt: number;
  validateSession?: () => void;
}

export interface SpeechTicketStoreOptions {
  now?: () => number;
  ttlMs?: number;
  maxTickets?: number;
  maxTicketsPerUser?: number;
  randomTicket?: () => string;
}

export class SpeechTicketStore {
  private readonly records = new Map<string, TicketRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxTickets: number;
  private readonly maxTicketsPerUser: number;
  private readonly randomTicket: () => string;

  constructor(options: SpeechTicketStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 60_000;
    this.maxTickets = options.maxTickets ?? 4096;
    this.maxTicketsPerUser = options.maxTicketsPerUser ?? 3;
    this.randomTicket = options.randomTicket ?? (() => randomBytes(32).toString('base64url'));
    if (this.ttlMs < 1 || this.ttlMs > 60_000 || this.maxTickets < 1 || this.maxTicketsPerUser < 1) throw new Error('Invalid speech-ticket limits');
  }

  issue(userId: string, purpose: SpeechTicketPurpose = 'speech', validateSession?: () => void) {
    if (!userId || userId.length > 128) throw new Error('Invalid ticket user');
    this.cleanup();
    if (this.records.size >= this.maxTickets) throw new SpeechTicketError('ticket_limited');
    const activeForUser = [...this.records.values()].filter(record => record.userId === userId).length;
    if (activeForUser >= this.maxTicketsPerUser) throw new SpeechTicketError('ticket_limited');
    const ticket = this.randomTicket();
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(ticket)) throw new Error('Speech ticket generator returned an unsafe ticket');
    const ticketHash = sha256(ticket);
    if (this.records.has(ticketHash)) throw new SpeechTicketError('ticket_limited');
    const issuedAt = this.now();
    const expiresAt = issuedAt + this.ttlMs;
    this.records.set(ticketHash, { userId, purpose, issuedAt, expiresAt, validateSession });
    return { ticket, expiresAt };
  }

  consume(ticket: string, purpose: SpeechTicketPurpose = 'speech') {
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(ticket)) throw new SpeechTicketError('invalid_ticket');
    const ticketHash = sha256(ticket);
    const record = this.records.get(ticketHash);
    this.records.delete(ticketHash);
    if (!record || record.expiresAt <= this.now() || record.purpose !== purpose) throw new SpeechTicketError('invalid_ticket');
    record.validateSession?.();
    return { userId: record.userId, issuedAt: record.issuedAt, expiresAt: record.expiresAt,
      ...(record.validateSession ? { validateSession: record.validateSession } : {}) };
  }

  cleanup() {
    const now = this.now();
    let removed = 0;
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  size() { return this.records.size; }
}
