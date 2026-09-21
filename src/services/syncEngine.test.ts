import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { enqueueAction, flushQueue, retryPolicy, setSimulatedOffline } from './syncEngine';

const URL = 'http://api.test/syncData';

type Handler = (req: { url: string; method: string; body: any }) => Response | Promise<Response>;

/** Tiny fake backend: records every request and lets each test decide the response. */
function mockServer(handler: Handler) {
  const calls: { url: string; method: string; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const req = {
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      };
      calls.push(req);
      return handler(req);
    }),
  );
  return calls;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const idle = () => vi.waitFor(async () => expect(await db.pendingActions.count()).toBe(0));

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  setSimulatedOffline(true); // also cancels any retry timer left by a previous test
  setSimulatedOffline(false);
  await db.pendingActions.clear();
  await db.failedActions.clear();
});

afterEach(() => {
  retryPolicy.baseMs = 1_000;
  retryPolicy.maxMs = 30_000;
  vi.unstubAllGlobals();
});

describe('store & forward engine', () => {
  it('holds actions while offline and forwards them, in order, on reconnect', async () => {
    const calls = mockServer(() => json({}, 201));

    setSimulatedOffline(true);
    await enqueueAction(URL, 'POST', { title: 'first' });
    await enqueueAction(URL, 'POST', { title: 'second' });
    await enqueueAction(URL, 'POST', { title: 'third' });

    expect(calls).toHaveLength(0);
    expect(await db.pendingActions.count()).toBe(3);

    setSimulatedOffline(false);
    await flushQueue();

    expect(calls.map((c) => c.body.title)).toEqual(['first', 'second', 'third']);
    expect(await db.pendingActions.count()).toBe(0);
  });

  it('does not duplicate an item when the server saved it but the response was lost', async () => {
    const saved: any[] = [];
    let dropResponse = true;

    mockServer(({ url, method, body }) => {
      if (method === 'GET') {
        const id = new globalThis.URL(url).searchParams.get('clientId');
        return json(saved.filter((s) => s.clientId === id));
      }
      saved.push(body); // server stores it...
      if (dropResponse) {
        dropResponse = false;
        throw new TypeError('network dropped'); // ...but the client never hears back
      }
      return json(body, 201);
    });

    await enqueueAction(URL, 'POST', { title: 'once only' });
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    // Retry (as the backoff timer would)
    await flushQueue();
    await idle();

    expect(saved).toHaveLength(1);
  });

  it('moves a permanently rejected (4xx) item to the failed table without blocking the rest', async () => {
    const calls = mockServer(({ body }) =>
      body.title === 'bad' ? json({ error: 'invalid' }, 422) : json({}, 201),
    );

    setSimulatedOffline(true);
    await enqueueAction(URL, 'POST', { title: 'bad' });
    await enqueueAction(URL, 'POST', { title: 'good' });
    setSimulatedOffline(false);
    await flushQueue();

    expect(calls.map((c) => c.body.title)).toEqual(['bad', 'good']);
    expect(await db.pendingActions.count()).toBe(0);
    const failed = await db.failedActions.toArray();
    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe(422);
  });

  it('keeps an item on a 5xx and retries with backoff until it succeeds', async () => {
    retryPolicy.baseMs = 10; // real timers, just fast
    retryPolicy.maxMs = 40;
    let failures = 2;
    const calls = mockServer(({ method }) => {
      if (method === 'GET') return json([]); // reconcile check: server has nothing
      return failures-- > 0 ? json({}, 503) : json({}, 201);
    });

    await enqueueAction(URL, 'POST', { title: 'flaky' });
    await vi.waitFor(async () => expect(await db.pendingActions.count()).toBe(0), { timeout: 2_000 });

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3);
  });

  it('never lets a new online action overtake older queued ones', async () => {
    const calls = mockServer(() => json({}, 201));

    setSimulatedOffline(true);
    await enqueueAction(URL, 'POST', { title: 'old' });
    setSimulatedOffline(false);
    await enqueueAction(URL, 'POST', { title: 'new' });
    await idle();

    expect(calls.map((c) => c.body.title)).toEqual(['old', 'new']);
  });
});
