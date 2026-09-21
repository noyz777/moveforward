import { useCallback, useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type FailedAction, type PendingAction } from '../db/schema';
import { ITEMS_URL } from '../config';
import { flushQueue, isOnline, setSimulatedOffline, subscribeToSync } from '../services/syncEngine';

export interface ServerItem {
  id: string;
  title: string;
  description: string;
}

/** Subscribe to a Dexie query; re-renders whenever the underlying table changes. */
function useLive<T>(query: () => Promise<T[]>): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setRows });
    return () => sub.unsubscribe();
    // query is a stable module-level function at every call site
  }, [query]);
  return rows;
}

const readPending = () => db.pendingActions.orderBy('id').toArray();
const readFailed = () => db.failedActions.orderBy('id').toArray();

export function useSync() {
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [simulatedOffline, setSimulated] = useState(false);
  const [serverItems, setServerItems] = useState<ServerItem[]>([]);

  const pending: PendingAction[] = useLive(readPending);
  const failed: FailedAction[] = useLive(readFailed);

  const online = browserOnline && !simulatedOffline;

  const refreshServerItems = useCallback(async () => {
    if (!isOnline()) return;
    try {
      const res = await fetch(ITEMS_URL);
      if (res.ok) setServerItems((await res.json()) as ServerItem[]);
    } catch {
      // Server unreachable - keep showing the last known data.
    }
  }, []);

  // Browser connectivity events.
  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Whenever we become (effectively) online: flush, then refresh what the server holds.
  useEffect(() => {
    setSimulatedOffline(simulatedOffline);
    if (!online) return;
    void flushQueue().then(refreshServerItems);
  }, [online, simulatedOffline, refreshServerItems]);

  // After any flush finishes (including retries), refresh the server view.
  useEffect(() => subscribeToSync(() => void refreshServerItems()), [refreshServerItems]);

  return {
    online,
    simulatedOffline,
    toggleSimulatedOffline: () => setSimulated((prev) => !prev),
    pending,
    failed,
    serverItems,
  };
}
