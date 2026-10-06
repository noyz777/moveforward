# Move Forward

An offline-first **Store & Forward** demo built with React 19, TypeScript, Vite and Dexie.js (IndexedDB).
Writes are saved locally first and forwarded to the server whenever it is reachable, in order, without duplicates.

[![CI](https://github.com/noyz777/moveforward/actions/workflows/ci.yml/badge.svg)](https://github.com/noyz777/moveforward/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why this matters

Apps used on remote sites, in vehicles or in basements lose their connection all the time. When a submission fails, users either lose their work or retry and create duplicates. This demo shows a small, testable pattern for avoiding both: save every write locally first, forward it in order once the server is reachable, and never lose or duplicate a write.

## How it works

```text
 UI submit ──► enqueueAction() ──► IndexedDB queue (Dexie) ──► flushQueue() ──► server
                                        ▲                          │
                                        └── keep + retry (backoff) ◄┘ network error / 5xx / 408 / 429
                                                                   └► dead-letter table on other 4xx
```

1. **Store** – every write goes through one function, `enqueueAction()`, which persists it to IndexedDB *before* any network call. There is no separate online path, so an online request can never overtake an older queued one.
2. **Forward** – `flushQueue()` replays the queue strictly FIFO (by auto-increment id). It is triggered on enqueue, on the browser `online` event, on reconnect from the simulator, and by a retry timer.
3. **Reconcile** – see the guarantees below.

### Guarantees and how they are achieved

| Concern | Approach |
| --- | --- |
| **Ordering** | Single FIFO queue; the head is re-read each iteration, so items added mid-flush are still sent in order. |
| **Duplicates after a lost response** | Each action gets a client-generated `clientId` (also sent as an `Idempotency-Key` header). The attempt counter is persisted *before* sending, so on any retry the engine first asks the server (`GET ?clientId=…`) whether it already has the item. |
| **Poison messages** | A permanent 4xx (not 408/429) moves the action to a `failedActions` table instead of blocking the queue; it is shown in the UI. |
| **Transient failures** | Network errors, 5xx, 408 and 429 keep the item queued and retry with exponential backoff (1s → 30s cap). |
| **Concurrent flushes** | A module-level lock, plus a "flush requested" flag so a request made mid-flush is not lost. |
| **Reliability of `navigator.onLine`** | It only reports that a network interface is up, so a failed `fetch` is also treated as "offline" and retried. |

### Design decisions and trade-offs

- **One code path, online or offline.** Every write is queued before any network call, so there is no "fast path" that could overtake an older queued item. The cost is one small IndexedDB write on every request, even when online.
- **Strict FIFO with head-of-line blocking.** Order is preserved by only ever sending the oldest item. A transient failure therefore delays everything behind it, which is deliberate: skipping ahead could apply writes out of order. Permanent 4xx errors are the exception and are moved aside so they cannot block the queue.
- **Persist the attempt before sending.** If the tab dies mid-request the outcome is unknown, so the next attempt first asks the server whether it already has the item. The cost is an extra write per attempt.

## Getting started

Requires Node.js 22.12 or later.

```bash
npm install
npm run dev:all   # mock backend (json-server on :3000) + Vite dev server
```

To run them separately, use `npm run mock` and `npm run dev` in two terminals.

Set `VITE_API_URL` in a `.env` file to point at a different backend (default `http://localhost:3000`).

Try it: click **Simulate Disconnect**, add a few items (they appear in the Pending Queue), then **Simulate Reconnect** and watch them flush in order into the Server Database panel.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev:all` | Start the mock backend and Vite together |
| `npm run mock` | Start the json-server mock backend on port 3000 |
| `npm run dev` | Start Vite only |
| `npm run build` | Type-check and build |
| `npm test` | Run the sync-engine tests (Vitest + fake-indexeddb) |
| `npm run lint` | Oxlint |

CI runs lint, tests and the production build on every push and pull request.

## Project structure

```text
src/
├── config.ts                    # API base URL
├── db/schema.ts                 # Dexie schema (pendingActions, failedActions) + v1→v2 migration
├── services/
│   ├── syncEngine.ts            # enqueue / flush / retry / reconcile
│   └── syncEngine.test.ts       # ordering, lost-response, 4xx, backoff tests
├── hooks/useSync.ts             # React glue: connectivity, live queue views, server data
├── App.tsx                      # Demo UI
└── main.tsx
```

## Known limitations and next steps

- **Idempotency is cooperative.** The reconcile step relies on the server supporting `GET ?clientId=…` (json-server does). A production API should honour the `Idempotency-Key` header itself, which removes the extra request and closes the small race between the check and the send.
- **Only creates are reconciled.** PUT and DELETE are sent through the same queue and are naturally idempotent, but there is no conflict resolution (e.g. two devices editing the same record). That would need versions/ETags or a CRDT-style merge.
- **Works only while the app is open.** A service worker with Background Sync would let the queue flush after the tab is closed.
- **No auth or payload encryption** for queued data at rest in IndexedDB.
- **Failed items can only be dismissed**, not edited and resubmitted.
- The UI is intentionally minimal; the interesting part is the engine.

## License

[MIT](LICENSE)
