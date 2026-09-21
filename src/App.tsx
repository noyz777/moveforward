import { useEffect, useState, useCallback } from 'react';
import { db, type PendingAction } from './db/schema';
import { flushQueue, queueOrSendAction } from './services/syncEngine';

export function App() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [simulatedOffline, setSimulatedOffline] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [pendingItems, setPendingItems] = useState<PendingAction[]>([]);
    const [syncedItems, setSyncedItems] = useState<Array<{ id: string; title: string; description: string }>>([]);

    const effectiveOnline = isOnline && !simulatedOffline;

    // 1. Memoized fetchers
    const refreshQueue = useCallback(async () => {
        const queue = await db.pendingActions.toArray();
        setPendingItems(queue);
    }, []);

    const refreshSyncedData = useCallback(async (onlineStatus: boolean) => {
        if (!onlineStatus) return;
        try {
            const res = await fetch('http://localhost:3000/syncData');
            if (res.ok) {
                const data = await res.json();
                setSyncedItems(data);
            }
        } catch {
            // Server offline or unreachable
        }
    }, []);

    // 2. Single Effect for external synchronization & event listeners
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Perform async sync/fetch without synchronous top-level execution
        const synchronize = async () => {
            if (effectiveOnline) {
                await flushQueue();
            }
            await refreshQueue();
            await refreshSyncedData(effectiveOnline);
        };

        void synchronize();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [effectiveOnline, refreshQueue, refreshSyncedData]);

    // 3. User submission handler
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        const payload = { title, description, createdAt: new Date().toISOString() };

        if (!effectiveOnline) {
            await db.pendingActions.add({
                url: 'http://localhost:3000/syncData',
                method: 'POST',
                payload,
                createdAt: Date.now(),
            });
        } else {
            await queueOrSendAction('http://localhost:3000/syncData', 'POST', payload);
        }

        setTitle('');
        setDescription('');
        await refreshQueue();
        await refreshSyncedData(effectiveOnline);
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'sans-serif' }}>
            <h1>Store & Forward Tester</h1>

            {/* Network Status & Controls */}
            <div style={{ padding: 15, background: effectiveOnline ? '#e6fffa' : '#ffebe9', borderRadius: 8, marginBottom: 20 }}>
                <h3>
                    Status: {effectiveOnline ? '🟢 Online' : '🔴 Offline (Storing Locally)'}
                </h3>
                <button
                    onClick={() => setSimulatedOffline((prev) => !prev)}
                    style={{ padding: '8px 16px', cursor: 'pointer' }}
                >
                    {simulatedOffline ? 'Simulate Reconnect' : 'Simulate Disconnect'}
                </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} style={{ marginBottom: 30, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3>Add Data Item</h3>
                <input
                    type="text"
                    placeholder="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{ padding: 8 }}
                />
                <input
                    type="text"
                    placeholder="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ padding: 8 }}
                />
                <button type="submit" style={{ padding: '10px 20px', cursor: 'pointer' }}>
                    Submit Item
                </button>
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Offline Queue Inspector */}
                <div style={{ background: '#f5f5f5', padding: 15, borderRadius: 8 }}>
                    <h3>📦 Pending Queue ({pendingItems.length})</h3>
                    {pendingItems.length === 0 ? (
                        <p style={{ color: '#666' }}>No items waiting to sync.</p>
                    ) : (
                        <ul>
                            {pendingItems.map((item) => (
                                <li key={item.id} style={{ marginBottom: 8 }}>
                                    <strong>{(item.payload as { title: string }).title}</strong>
                                    <br />
                                    <small>Queued: {new Date(item.createdAt).toLocaleTimeString()}</small>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Server Data Inspector */}
                <div style={{ background: '#f5f5f5', padding: 15, borderRadius: 8 }}>
                    <h3>🌐 Server Database ({syncedItems.length})</h3>
                    {syncedItems.length === 0 ? (
                        <p style={{ color: '#666' }}>No items on server yet.</p>
                    ) : (
                        <ul>
                            {syncedItems.map((item) => (
                                <li key={item.id} style={{ marginBottom: 8 }}>
                                    <strong>{item.title}</strong> - {item.description}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;