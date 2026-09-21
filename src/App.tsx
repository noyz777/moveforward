import { useState } from 'react';
import { ITEMS_URL } from './config';
import { clearFailedActions, enqueueAction } from './services/syncEngine';
import { useSync } from './hooks/useSync';

const panel = { background: '#f5f5f5', padding: 15, borderRadius: 8 } as const;

export function App() {
  const { online, simulatedOffline, toggleSimulatedOffline, pending, failed, serverItems } = useSync();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // One code path online or offline: save locally, then the engine forwards it.
    await enqueueAction(ITEMS_URL, 'POST', {
      title,
      description,
      createdAt: new Date().toISOString(),
    });

    setTitle('');
    setDescription('');
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Store & Forward Tester</h1>

      <div
        style={{
          padding: 15,
          background: online ? '#e6fffa' : '#ffebe9',
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <h3>Status: {online ? '🟢 Online' : '🔴 Offline (storing locally)'}</h3>
        <button onClick={toggleSimulatedOffline} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          {simulatedOffline ? 'Simulate Reconnect' : 'Simulate Disconnect'}
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ marginBottom: 30, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
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
        <div style={panel}>
          <h3>📦 Pending Queue ({pending.length})</h3>
          {pending.length === 0 ? (
            <p style={{ color: '#666' }}>No items waiting to sync.</p>
          ) : (
            <ul>
              {pending.map((item) => (
                <li key={item.clientId} style={{ marginBottom: 8 }}>
                  <strong>{String(item.payload.title ?? '(untitled)')}</strong>
                  <br />
                  <small>
                    Queued {new Date(item.createdAt).toLocaleTimeString()}
                    {item.attempts > 0 && ` · attempts: ${item.attempts}`}
                    {item.lastError && ` · ${item.lastError}, retrying`}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={panel}>
          <h3>🌐 Server Database ({serverItems.length})</h3>
          {serverItems.length === 0 ? (
            <p style={{ color: '#666' }}>No items on server yet.</p>
          ) : (
            <ul>
              {serverItems.map((item) => (
                <li key={item.id} style={{ marginBottom: 8 }}>
                  <strong>{item.title}</strong> - {item.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {failed.length > 0 && (
        <div style={{ ...panel, background: '#fff4e5', marginTop: 20 }}>
          <h3>⚠️ Rejected by server ({failed.length})</h3>
          <ul>
            {failed.map((item) => (
              <li key={item.clientId}>
                {String(item.payload.title ?? '(untitled)')} <small>· HTTP {item.status}</small>
              </li>
            ))}
          </ul>
          <button onClick={() => void clearFailedActions()} style={{ cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
