import Dexie, { type Table } from 'dexie';

export type HttpMethod = 'POST' | 'PUT' | 'DELETE';

export interface PendingAction {
  /** Auto-increment local id. Insertion order == replay order (FIFO). */
  id?: number;
  /** Stable, client-generated id. Sent as an Idempotency-Key so a replay can be recognised. */
  clientId: string;
  url: string;
  method: HttpMethod;
  payload: Record<string, unknown>;
  createdAt: number;
  /** How many times we have started sending this action. > 1 means the outcome of an earlier try is unknown. */
  attempts: number;
  lastError?: string;
}

/** Actions the server permanently rejected (4xx). Kept for inspection instead of blocking the queue. */
export interface FailedAction extends PendingAction {
  failedAt: number;
  status: number;
}

export class StoreForwardDB extends Dexie {
  pendingActions!: Table<PendingAction, number>;
  failedActions!: Table<FailedAction, number>;

  constructor() {
    super('StoreForwardDatabase');

    this.version(1).stores({
      pendingActions: '++id, createdAt',
    });

    // v2: dead-letter table + clientId/attempts on queued actions.
    this.version(2)
      .stores({
        pendingActions: '++id, clientId, createdAt',
        failedActions: '++id, failedAt',
      })
      .upgrade((tx) =>
        tx
          .table('pendingActions')
          .toCollection()
          .modify((action: Partial<PendingAction>) => {
            action.clientId ??= crypto.randomUUID();
            action.attempts ??= 0;
          }),
      );
  }
}

export const db = new StoreForwardDB();
