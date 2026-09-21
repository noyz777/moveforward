import { db, type HttpMethod, type PendingAction } from '../db/schema';

/**
 * Store & Forward engine.
 *
 * Every write goes through enqueueAction(): it is saved to IndexedDB first and
 * then flushed. Because there is exactly one path, ordering is always FIFO and
 * an online request can never overtake an older queued one.
 */

/** Exponential backoff bounds. Exported (mutable) so tests can shrink them. */
export const retryPolicy = { baseMs: 1_000, maxMs: 30_000 };

// ---------------------------------------------------------------------------
// Connectivity
// navigator.onLine only says "a network interface is up", not "the server is
// reachable" - so a failed fetch is treated as offline too (see flushQueue).
// The override lets the UI simulate a disconnect.
// ---------------------------------------------------------------------------
let simulatedOffline = false;

export function setSimulatedOffline(value: boolean) {
  simulatedOffline = value;
  if (value) clearRetryTimer();
}

export function isOnline(): boolean {
  return navigator.onLine && !simulatedOffline;
}

// ---------------------------------------------------------------------------
// Change notifications (so the UI can re-read server data after a flush)
// ---------------------------------------------------------------------------
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------
export async function enqueueAction(
  url: string,
  method: HttpMethod,
  payload: Record<string, unknown>,
): Promise<string> {
  const clientId = crypto.randomUUID();
  await db.pendingActions.add({
    clientId,
    url,
    method,
    // POST bodies carry the clientId so the server (and reconcile check) can recognise a replay.
    payload: method === 'POST' ? { ...payload, clientId } : payload,
    createdAt: Date.now(),
    attempts: 0,
  });
  void flushQueue();
  return clientId;
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------
let isSyncing = false;
let flushRequested = false; // a flush was asked for while one was running
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryCount = 0; // consecutive failed flushes; drives the backoff

function clearRetryTimer() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = Math.min(retryPolicy.baseMs * 2 ** retryCount, retryPolicy.maxMs);
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void flushQueue();
  }, delay);
}

/** 4xx means "this request will never succeed" - except these two, which are transient. */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * A previous attempt may have reached the server even though we never saw the
 * response. Before re-sending a POST, ask the server whether it already has it.
 * (A production API should instead honour the Idempotency-Key header itself.)
 */
async function alreadyOnServer(action: PendingAction): Promise<boolean> {
  try {
    const res = await fetch(`${action.url}?clientId=${encodeURIComponent(action.clientId)}`);
    if (!res.ok) return false;
    const found: unknown = await res.json();
    return Array.isArray(found) && found.length > 0;
  } catch {
    return false;
  }
}

export async function flushQueue(): Promise<void> {
  if (isSyncing) {
    flushRequested = true;
    return;
  }
  if (!isOnline()) return;

  isSyncing = true;
  clearRetryTimer();

  try {
    // Re-read the head each iteration so items enqueued mid-flush are picked up in order.
    for (;;) {
      if (!isOnline()) return;

      const action = await db.pendingActions.orderBy('id').first();
      if (!action || action.id === undefined) {
        retryCount = 0;
        return;
      }

      // Persist the attempt BEFORE sending: if the tab dies mid-request we still know the outcome is unknown.
      const attempts = action.attempts + 1;
      await db.pendingActions.update(action.id, { attempts });

      if (action.method === 'POST' && attempts > 1 && (await alreadyOnServer(action))) {
        await db.pendingActions.delete(action.id);
        continue;
      }

      let status = 0;
      try {
        const res = await fetch(action.url, {
          method: action.method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': action.clientId },
          body: JSON.stringify(action.payload),
        });
        status = res.status;

        if (res.ok) {
          await db.pendingActions.delete(action.id);
          retryCount = 0;
          continue;
        }
      } catch {
        // Network error / server unreachable: status stays 0 -> retry later.
      }

      if (isPermanentFailure(status)) {
        // Dead-letter it so one bad item can't block everything behind it.
        const id = action.id;
        await db.transaction('rw', db.pendingActions, db.failedActions, async () => {
          const { id: _drop, ...rest } = action;
          await db.failedActions.add({ ...rest, attempts, failedAt: Date.now(), status });
          await db.pendingActions.delete(id);
        });
        continue;
      }

      // Transient (network, 5xx, 408, 429): keep the item, back off, try again.
      await db.pendingActions.update(action.id, {
        lastError: status ? `HTTP ${status}` : 'Network error',
      });
      scheduleRetry();
      return;
    }
  } finally {
    isSyncing = false;
    notify();
    if (flushRequested) {
      flushRequested = false;
      void flushQueue();
    }
  }
}

export async function clearFailedActions() {
  await db.failedActions.clear();
}
