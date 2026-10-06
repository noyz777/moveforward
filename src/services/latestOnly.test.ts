import { describe, expect, it } from 'vitest';
import { latestOnly } from './latestOnly';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('latestOnly', () => {
  it('drops an older response that arrives after a newer one', async () => {
    const older = deferred<string[]>();
    const newer = deferred<string[]>();
    const pending = [older, newer];
    const results: string[][] = [];
    const refresh = latestOnly(() => pending.shift()!.promise, (v) => results.push(v));

    const first = refresh(); // started first, will resolve last
    const second = refresh();
    newer.resolve(['one', 'two']);
    await second;
    older.resolve(['one']); // stale snapshot arrives late
    await first;

    expect(results).toEqual([['one', 'two']]);
  });

  it('only delivers the latest call even when responses arrive in order', async () => {
    const a = deferred<number>();
    const b = deferred<number>();
    const pending = [a, b];
    const results: number[] = [];
    const refresh = latestOnly(() => pending.shift()!.promise, (v) => results.push(v));

    const first = refresh();
    const second = refresh();
    a.resolve(1);
    b.resolve(2);
    await Promise.all([first, second]);

    expect(results).toEqual([2]);
  });

  it('delivers every result when calls do not overlap', async () => {
    let n = 0;
    const results: number[] = [];
    const refresh = latestOnly(async () => ++n, (v) => results.push(v));

    await refresh();
    await refresh();

    expect(results).toEqual([1, 2]);
  });

  it('propagates fetcher errors without delivering a result', async () => {
    const results: number[] = [];
    const refresh = latestOnly<number>(() => Promise.reject(new Error('down')), (v) => results.push(v));

    await expect(refresh()).rejects.toThrow('down');
    expect(results).toEqual([]);
  });
});
