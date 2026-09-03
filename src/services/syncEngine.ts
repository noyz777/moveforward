import { db, type PendingAction } from '../db/schema';

// Action to record data locally
export async function queueOrSendAction(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    payload: Record<string, unknown>
) {
    if (!navigator.onLine) {
        // Store offline
        await db.pendingActions.add({
            url,
            method,
            payload,
            createdAt: Date.now(),
        });
        return { status: 'queued' };
    }

    // Send immediately if online
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return await response.json();
    } catch (err) {
        // Fallback to queue if request fails due to unexpected network loss
        await db.pendingActions.add({
            url,
            method,
            payload,
            createdAt: Date.now(),
        });
        return { status: 'queued' };
    }
}

// Flush local queue when back online
export async function flushQueue() {
    const queue = await db.pendingActions.orderBy('createdAt').toArray();

    for (const item of queue) {
        try {
            const res = await fetch(item.url, {
                method: item.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.payload),
            });

            if (res.ok && item.id) {
                // Remove item from local DB upon successful server delivery
                await db.pendingActions.delete(item.id);
            }
        } catch {
            // Stop flushing if still failing; wait for next reconnect event
            break;
        }
    }
}