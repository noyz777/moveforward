import Dexie, { type Table } from 'dexie';

export interface PendingAction {
    id?: number;
    url: string;
    method: 'POST' | 'PUT' | 'DELETE';
    payload: Record<string, unknown>;
    createdAt: number;
}

export class StoreForwardDB extends Dexie {
    pendingActions!: Table<PendingAction>;

    constructor() {
        super('StoreForwardDatabase');
        this.version(1).stores({
            pendingActions: '++id, createdAt',
        });
    }
}

export const db = new StoreForwardDB();