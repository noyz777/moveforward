import { db } from '../db/schema';

// Module-level lock to prevent concurrent flush calls
let isSyncing = false;

// Action to record data locally or send immediately
export async function queueOrSendAction(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    payload: Record<string, unknown>
) {
    // Always queue first if offline or simulated offline
    if (!navigator.onLine) {
        await db.pendingActions.add({
            url,
            method,
            payload,
            createdAt: Date.now(),
        });
        return { status: 'queued' };
    }

    // Attempt direct request if online
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            return await response.json();
        }
    } catch {
        // Fall through to queueing on network connection drops
    }

    // Fallback to local queue if server returns non-2xx status or fetch fails
    await db.pendingActions.add({
        url,
        method,
        payload,
        createdAt: Date.now(),
    });
    return { status: 'queued' };
}

// Flush local queue when back online
export async function flushQueue() {
    // Prevent duplicate execution if flush is already running
    if (isSyncing) return;
    isSyncing = true;

    try {
        const queue = await db.pendingActions.orderBy('createdAt').toArray();

        for (const item of queue) {
            // Guard clause for safety
            if (item.id === undefined) continue;

            try {
                const res = await fetch(item.url, {
                    method: item.method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.payload),
                });

                if (res.ok) {
                    // Remove from local IndexedDB immediately upon successful response
                    await db.pendingActions.delete(item.id);
                } else {
                    // Stop processing queue if server returns 4xx/5xx error
                    break;
                }
            } catch {
                // Stop processing if network connection drops mid-flush
                break;
            }
        }
    } finally {
        // Always release lock when finished
        isSyncing = false;
    }
}